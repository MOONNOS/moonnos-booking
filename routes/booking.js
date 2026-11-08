const express = require("express");
const rateLimit = require("express-rate-limit");
const { db } = require("../db");
const { today, isDate } = require("../lib/dates");
const { SLOTS_SQL, INSERT_SQL } = require("../lib/slots");

const router = express.Router();

// GET /api/booking : วันที่เปิดรับและจำนวนคิวที่เหลือ (ไม่แสดงรายชื่อใคร)
router.get("/", async (req, res, next) => {
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

// POST /api/booking : ลูกค้าจองคิว
router.post("/", bookLimit, async (req, res, next) => {
  try {
    const d = req.body || {};
    if (d.website) return res.json({ ok: true }); // ช่องดักบอท
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

module.exports = router;
