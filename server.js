require("dotenv").config();
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const { createClient } = require("@libsql/client");

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const JWT_SECRET = process.env.JWT_SECRET || "";
if (!ADMIN_PASSWORD || !JWT_SECRET) {
  console.error("ต้องตั้งค่า ADMIN_PASSWORD และ JWT_SECRET ก่อนเริ่มเซิร์ฟเวอร์");
  process.exit(1);
}

const db = createClient({
  url: process.env.TURSO_DATABASE_URL || "file:local.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const origins = (process.env.CORS_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);
const app = express();
app.set("trust proxy", 1);
app.use(cors({ origin: origins.length ? origins : true }));
app.use(express.json({ limit: "20kb", type: ["application/json", "text/plain"] }));

const fmtDay = (ms) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
const today = () => fmtDay(Date.now());
const isDate = (s) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;

async function initDb() {
  await db.batch(
    [
      "CREATE TABLE IF NOT EXISTS slots (date TEXT PRIMARY KEY, capacity INTEGER NOT NULL DEFAULT 5)",
      "CREATE TABLE IF NOT EXISTS bookings (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL, line TEXT, note TEXT, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL)",
      "CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(date)",
    ],
    "write"
  );
}

const SLOTS_SQL = `SELECT s.date, s.capacity, COUNT(b.id) AS used
  FROM slots s LEFT JOIN bookings b ON b.date = s.date AND b.status = 'active'
  WHERE s.date >= ? GROUP BY s.date, s.capacity ORDER BY s.date`;

const INSERT_SQL = `INSERT INTO bookings (date, name, phone, line, note, status, created_at)
  SELECT ?, ?, ?, ?, ?, 'active', ?
  WHERE COALESCE((SELECT capacity FROM slots WHERE date = ?), 0) >
        (SELECT COUNT(*) FROM bookings WHERE date = ? AND status = 'active')
    AND NOT EXISTS (SELECT 1 FROM bookings WHERE date = ? AND phone = ? AND status = 'active')`;

app.get("/api/health", (req, res) => res.json({ ok: true }));

// ---------- สาธารณะ: ลูกค้า ----------
app.get("/api/booking", async (req, res, next) => {
  try {
    const r = await db.execute({ sql: SLOTS_SQL, args: [today()] });
    const slots = r.rows
      .filter((x) => Number(x.capacity) > 0)
      .map((x) => ({
        date: x.date,
        capacity: Number(x.capacity),
        remaining: Math.max(0, Number(x.capacity) - Number(x.used)),
      }));
    res.json({ ok: true, slots });
  } catch (e) {
    next(e);
  }
});

const bookLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "too_many" },
});

app.post("/api/booking", bookLimit, async (req, res, next) => {
  try {
    const d = req.body || {};
    if (d.website) return res.json({ ok: true });
    const date = String(d.date || "");
    const name = String(d.name || "").trim().slice(0, 80);
    const phone = String(d.phone || "").replace(/[^0-9+]/g, "").slice(0, 20);
    const line = String(d.line || "").trim().slice(0, 60);
    const note = String(d.note || "").trim().slice(0, 300);
    if (!name || !phone) return res.json({ ok: false, error: "missing" });
    if (phone.replace(/\D/g, "").length < 9) return res.json({ ok: false, error: "invalid_phone" });
    if (!isDate(date) || date < today()) return res.json({ ok: false, error: "closed" });

    const r = await db.execute({
      sql: INSERT_SQL,
      args: [date, name, phone, line, note, new Date().toISOString(), date, date, date, phone],
    });
    if (r.rowsAffected === 1) return res.json({ ok: true });

    const s = await db.execute({ sql: "SELECT capacity FROM slots WHERE date = ?", args: [date] });
    if (!s.rows.length || Number(s.rows[0].capacity) <= 0) return res.json({ ok: false, error: "closed" });
    const dup = await db.execute({
      sql: "SELECT 1 FROM bookings WHERE date = ? AND phone = ? AND status = 'active'",
      args: [date, phone],
    });
    res.json({ ok: false, error: dup.rows.length ? "duplicate" : "full" });
  } catch (e) {
    next(e);
  }
});

// ---------- แอดมิน ----------
const sha = (s) => crypto.createHash("sha256").update(String(s)).digest();
const loginLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "too_many" },
});

app.post("/api/admin/login", loginLimit, (req, res) => {
  const pw = req.body && req.body.password ? req.body.password : "";
  if (!crypto.timingSafeEqual(sha(pw), sha(ADMIN_PASSWORD))) {
    return res.status(401).json({ ok: false, error: "bad_password" });
  }
  res.json({ ok: true, token: jwt.sign({ role: "admin" }, JWT_SECRET, { expiresIn: "12h" }) });
});

function auth(req, res, next) {
  const t = (req.headers.authorization || "").replace(/^Bearer /, "");
  try {
    jwt.verify(t, JWT_SECRET);
    next();
  } catch (e) {
    res.status(401).json({ ok: false, error: "unauthorized" });
  }
}

app.get("/api/admin/slots", auth, async (req, res, next) => {
  try {
    const r = await db.execute({ sql: SLOTS_SQL, args: [fmtDay(Date.now() - 30 * 86400000)] });
    res.json({
      ok: true,
      slots: r.rows.map((x) => ({ date: x.date, capacity: Number(x.capacity), used: Number(x.used) })),
    });
  } catch (e) {
    next(e);
  }
});

app.put("/api/admin/slots", auth, async (req, res, next) => {
  try {
    const date = String((req.body || {}).date || "");
    const cap = Number((req.body || {}).capacity);
    if (!isDate(date) || !Number.isInteger(cap) || cap < 0 || cap > 100) {
      return res.status(400).json({ ok: false, error: "invalid" });
    }
    await db.execute({
      sql: "INSERT INTO slots (date, capacity) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET capacity = excluded.capacity",
      args: [date, cap],
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

app.delete("/api/admin/slots/:date", auth, async (req, res, next) => {
  try {
    const date = req.params.date;
    if (!isDate(date)) return res.status(400).json({ ok: false, error: "invalid" });
    const c = await db.execute({
      sql: "SELECT COUNT(*) AS n FROM bookings WHERE date = ? AND status = 'active'",
      args: [date],
    });
    if (Number(c.rows[0].n) > 0) return res.status(409).json({ ok: false, error: "has_bookings" });
    await db.execute({ sql: "DELETE FROM slots WHERE date = ?", args: [date] });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

app.get("/api/admin/bookings", auth, async (req, res, next) => {
  try {
    const date = String(req.query.date || "");
    if (!isDate(date)) return res.status(400).json({ ok: false, error: "invalid" });
    const r = await db.execute({
      sql: "SELECT id, name, phone, line, note, status, created_at FROM bookings WHERE date = ? ORDER BY id",
      args: [date],
    });
    res.json({ ok: true, bookings: r.rows.map((x) => ({ ...x })) });
  } catch (e) {
    next(e);
  }
});

app.post("/api/admin/bookings/:id/cancel", auth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ ok: false, error: "invalid" });
    await db.execute({ sql: "UPDATE bookings SET status = 'cancelled' WHERE id = ?", args: [id] });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

app.get("/admin", (req, res) => {
  res.set("X-Robots-Tag", "noindex");
  res.sendFile(path.join(__dirname, "admin.html"));
});
app.get("/", (req, res) => res.type("text").send("moonnos-booking"));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ ok: false, error: "server" });
});

const PORT = process.env.PORT || 4000;
initDb()
  .then(() => app.listen(PORT, () => console.log("moonnos-booking กำลังรันที่พอร์ต " + PORT)))
  .catch((e) => {
    console.error("เชื่อมต่อฐานข้อมูลไม่สำเร็จ:", e);
    process.exit(1);
  });
