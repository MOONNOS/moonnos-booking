const { createClient } = require("@libsql/client");

// ใช้ฐานข้อมูล Turso ตามตัวแปร TURSO_DATABASE_URL / TURSO_AUTH_TOKEN
// ถ้าไม่ตั้งค่า จะใช้ไฟล์ในเครื่อง (สำหรับทดลองในคอมเท่านั้น)
const db = createClient({
  url: process.env.TURSO_DATABASE_URL || "file:data/local.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function initDb() {
  await db.batch(
    [
      "CREATE TABLE IF NOT EXISTS slots (date TEXT PRIMARY KEY, capacity INTEGER NOT NULL DEFAULT 5)",
      "CREATE TABLE IF NOT EXISTS bookings (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL, line TEXT, note TEXT, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL)",
      "CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(date)",
      // เอกสาร: ใบเสนอราคา (quotation) และใบวางบิล (billing)
      `CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        number TEXT NOT NULL UNIQUE,
        issue_date TEXT NOT NULL,
        end_date TEXT,
        customer_name TEXT NOT NULL,
        customer_address TEXT,
        customer_tax_id TEXT,
        customer_phone TEXT,
        items TEXT NOT NULL,
        subtotal REAL NOT NULL,
        discount REAL NOT NULL DEFAULT 0,
        vat_percent REAL NOT NULL DEFAULT 0,
        vat_amount REAL NOT NULL DEFAULT 0,
        total REAL NOT NULL,
        notes TEXT,
        ref_number TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      "CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type, id)",
      "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
    ],
    "write"
  );
}

module.exports = { db, initDb };
