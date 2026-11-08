const express = require("express");
const { db } = require("../db");
const auth = require("../middleware/auth");
const { today, isDate } = require("../lib/dates");
const { calc } = require("../lib/money");

const router = express.Router();
router.use(auth);

const TYPES = {
  quotation: { prefix: "QT", statuses: ["draft", "sent", "accepted", "rejected", "cancelled"], first: "draft" },
  billing: { prefix: "BN", statuses: ["unpaid", "paid", "cancelled"], first: "unpaid" },
};
const SETTING_KEYS = ["business_name", "business_address", "business_tax_id", "business_phone", "payment_info", "default_vat"];

// ---------- ตั้งค่าข้อมูลร้าน ----------
router.get("/settings", async (req, res, next) => {
  try {
    const r = await db.execute("SELECT key, value FROM settings");
    const out = {};
    SETTING_KEYS.forEach((k) => (out[k] = k === "default_vat" ? "0" : ""));
    r.rows.forEach((x) => { if (SETTING_KEYS.includes(x.key)) out[x.key] = x.value; });
    res.json({ ok: true, settings: out });
  } catch (e) {
    next(e);
  }
});

router.put("/settings", async (req, res, next) => {
  try {
    const b = req.body || {};
    const stmts = [];
    for (const k of SETTING_KEYS) {
      if (b[k] === undefined) continue;
      let v = String(b[k]).trim().slice(0, 500);
      if (k === "default_vat") {
        const n = Number(v || 0);
        if (!(n >= 0 && n <= 100)) return res.status(400).json({ ok: false, error: "invalid" });
        v = String(n);
      }
      stmts.push({ sql: "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", args: [k, v] });
    }
    if (stmts.length) await db.batch(stmts, "write");
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ---------- ตัวช่วย ----------
function clean(b) {
  const items = Array.isArray(b.items)
    ? b.items.slice(0, 50).map((it) => ({
        description: String((it || {}).description || "").trim().slice(0, 200),
        qty: Number((it || {}).qty),
        price: Number((it || {}).price),
      }))
    : [];
  if (!items.length || items.some((it) => !it.description || !(it.qty > 0) || it.qty > 100000 || !(it.price >= 0) || it.price > 10000000)) {
    return { error: "items" };
  }
  const customer_name = String(b.customer_name || "").trim().slice(0, 120);
  if (!customer_name) return { error: "customer" };
  const issue_date = String(b.issue_date || "");
  const end_date = b.end_date ? String(b.end_date) : "";
  if (!isDate(issue_date) || (end_date && !isDate(end_date))) return { error: "date" };
  const vat_percent = Number(b.vat_percent || 0);
  const discount = Number(b.discount || 0);
  if (!(vat_percent >= 0 && vat_percent <= 100) || !(discount >= 0)) return { error: "amount" };
  const t = calc(items, discount, vat_percent);
  return {
    v: {
      issue_date,
      end_date,
      customer_name,
      customer_address: String(b.customer_address || "").trim().slice(0, 300),
      customer_tax_id: String(b.customer_tax_id || "").trim().slice(0, 30),
      customer_phone: String(b.customer_phone || "").trim().slice(0, 30),
      items,
      vat_percent,
      notes: String(b.notes || "").trim().slice(0, 1000),
      ...t,
    },
  };
}

async function nextNumber(type, issueDate) {
  const prefix = TYPES[type].prefix + "-" + issueDate.slice(0, 4) + "-";
  const r = await db.execute({
    sql: "SELECT number FROM documents WHERE type = ? AND number LIKE ? ORDER BY number DESC LIMIT 1",
    args: [type, prefix + "%"],
  });
  const last = r.rows.length ? Number(String(r.rows[0].number).slice(prefix.length)) : 0;
  return prefix + String(last + 1).padStart(4, "0");
}

const INSERT_DOC = `INSERT INTO documents (type, number, issue_date, end_date, customer_name, customer_address, customer_tax_id,
  customer_phone, items, subtotal, discount, vat_percent, vat_amount, total, notes, ref_number, status, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

async function insertDoc(type, v, ref) {
  const now = new Date().toISOString();
  for (let i = 0; i < 3; i++) {
    const number = await nextNumber(type, v.issue_date);
    try {
      const r = await db.execute({
        sql: INSERT_DOC,
        args: [type, number, v.issue_date, v.end_date || null, v.customer_name, v.customer_address, v.customer_tax_id,
          v.customer_phone, JSON.stringify(v.items), v.subtotal, v.discount, v.vat_percent, v.vat_amount, v.total,
          v.notes, ref || "", TYPES[type].first, now, now],
      });
      return { id: Number(r.lastInsertRowid), number };
    } catch (e) {
      if (!/UNIQUE/i.test(String(e && e.message))) throw e; // เลขซ้ำ (มีคนสร้างพร้อมกัน) ให้ลองใหม่
    }
  }
  throw new Error("สร้างเลขที่เอกสารไม่สำเร็จ");
}

const toDoc = (x) => ({
  ...x,
  id: Number(x.id),
  subtotal: Number(x.subtotal),
  discount: Number(x.discount),
  vat_percent: Number(x.vat_percent),
  vat_amount: Number(x.vat_amount),
  total: Number(x.total),
  items: JSON.parse(x.items),
});

// ---------- เอกสาร ----------
router.get("/docs", async (req, res, next) => {
  try {
    const type = String(req.query.type || "");
    if (!TYPES[type]) return res.status(400).json({ ok: false, error: "invalid" });
    const r = await db.execute({
      sql: "SELECT id, type, number, issue_date, end_date, customer_name, total, status, ref_number FROM documents WHERE type = ? ORDER BY id DESC LIMIT 200",
      args: [type],
    });
    res.json({ ok: true, docs: r.rows.map((x) => ({ ...x, id: Number(x.id), total: Number(x.total) })) });
  } catch (e) {
    next(e);
  }
});

router.get("/docs/:id", async (req, res, next) => {
  try {
    const r = await db.execute({ sql: "SELECT * FROM documents WHERE id = ?", args: [Number(req.params.id)] });
    if (!r.rows.length) return res.status(404).json({ ok: false, error: "not_found" });
    res.json({ ok: true, doc: toDoc(r.rows[0]) });
  } catch (e) {
    next(e);
  }
});

router.post("/docs", async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!TYPES[b.type]) return res.status(400).json({ ok: false, error: "invalid" });
    const c = clean(b);
    if (c.error) return res.status(400).json({ ok: false, error: c.error });
    const ref = String(b.ref_number || "").trim().slice(0, 40);
    const d = await insertDoc(b.type, c.v, ref);
    res.json({ ok: true, id: d.id, number: d.number });
  } catch (e) {
    next(e);
  }
});

router.put("/docs/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const c = clean(req.body || {});
    if (c.error) return res.status(400).json({ ok: false, error: c.error });
    const v = c.v;
    const r = await db.execute({
      sql: `UPDATE documents SET issue_date = ?, end_date = ?, customer_name = ?, customer_address = ?, customer_tax_id = ?,
            customer_phone = ?, items = ?, subtotal = ?, discount = ?, vat_percent = ?, vat_amount = ?, total = ?,
            notes = ?, ref_number = ?, updated_at = ? WHERE id = ?`,
      args: [v.issue_date, v.end_date || null, v.customer_name, v.customer_address, v.customer_tax_id, v.customer_phone,
        JSON.stringify(v.items), v.subtotal, v.discount, v.vat_percent, v.vat_amount, v.total, v.notes,
        String((req.body || {}).ref_number || "").trim().slice(0, 40), new Date().toISOString(), id],
    });
    if (r.rowsAffected !== 1) return res.status(404).json({ ok: false, error: "not_found" });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post("/docs/:id/status", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const s = String((req.body || {}).status || "");
    const r = await db.execute({ sql: "SELECT type FROM documents WHERE id = ?", args: [id] });
    if (!r.rows.length) return res.status(404).json({ ok: false, error: "not_found" });
    if (!TYPES[r.rows[0].type].statuses.includes(s)) return res.status(400).json({ ok: false, error: "invalid" });
    await db.execute({ sql: "UPDATE documents SET status = ?, updated_at = ? WHERE id = ?", args: [s, new Date().toISOString(), id] });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// สร้างใบวางบิลจากใบเสนอราคา (คัดลอกลูกค้ากับรายการ)
router.post("/docs/:id/to-billing", async (req, res, next) => {
  try {
    const r = await db.execute({ sql: "SELECT * FROM documents WHERE id = ? AND type = 'quotation'", args: [Number(req.params.id)] });
    if (!r.rows.length) return res.status(404).json({ ok: false, error: "not_found" });
    const q = toDoc(r.rows[0]);
    const c = clean({ ...q, end_date: "", issue_date: today(), notes: "" });
    if (c.error) return res.status(400).json({ ok: false, error: c.error });
    const d = await insertDoc("billing", c.v, q.number);
    res.json({ ok: true, id: d.id, number: d.number });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
