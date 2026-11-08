const crypto = require("crypto");
const express = require("express");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const { db } = require("../db");
const auth = require("../middleware/auth");
const { fmtDay, isDate } = require("../lib/dates");
const { SLOTS_SQL } = require("../lib/slots");

const router = express.Router();
const sha = (s) => crypto.createHash("sha256").update(String(s)).digest();

const loginLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "too_many" },
});

// POST /api/admin/login
router.post("/login", loginLimit, (req, res) => {
  const pw = req.body && req.body.password ? req.body.password : "";
  if (!crypto.timingSafeEqual(sha(pw), sha(process.env.ADMIN_PASSWORD))) {
    return res.status(401).json({ ok: false, error: "bad_password" });
  }
  const token = jwt.sign({ role: "admin" }, process.env.JWT_SECRET, { expiresIn: "12h" });
  res.json({ ok: true, token });
});

// ทุกเส้นทางด้านล่างต้องล็อกอินก่อน
router.use(auth);

router.get("/slots", async (req, res, next) => {
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

router.put("/slots", async (req, res, next) => {
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

router.delete("/slots/:date", async (req, res, next) => {
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

router.get("/bookings", async (req, res, next) => {
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

router.post("/bookings/:id/cancel", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ ok: false, error: "invalid" });
    await db.execute({ sql: "UPDATE bookings SET status = 'cancelled' WHERE id = ?", args: [id] });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
