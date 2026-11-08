// คำสั่ง SQL ที่ใช้ร่วมกัน
const SLOTS_SQL = `SELECT s.date, s.capacity, COUNT(b.id) AS used
  FROM slots s LEFT JOIN bookings b ON b.date = s.date AND b.status = 'active'
  WHERE s.date >= ? GROUP BY s.date, s.capacity ORDER BY s.date`;

// บันทึกคิวด้วยคำสั่งเดียว: ตรวจว่าวันเปิดอยู่ ยังไม่เต็ม และเบอร์นี้ยังไม่จองวันนี้ พร้อมกัน
const INSERT_SQL = `INSERT INTO bookings (date, name, phone, line, note, status, created_at)
  SELECT ?, ?, ?, ?, ?, 'active', ?
  WHERE COALESCE((SELECT capacity FROM slots WHERE date = ?), 0) >
        (SELECT COUNT(*) FROM bookings WHERE date = ? AND status = 'active')
    AND NOT EXISTS (SELECT 1 FROM bookings WHERE date = ? AND phone = ? AND status = 'active')`;

module.exports = { SLOTS_SQL, INSERT_SQL };
