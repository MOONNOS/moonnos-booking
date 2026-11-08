# moonnos-booking

ระบบจองคิววันยื่นเอกสารของมูนนอส (หลังบ้าน + หน้าแอดมิน)

## โครงสร้าง

- `server.js` จุดเริ่มต้น เชื่อมเส้นทางทั้งหมด
- `db.js` เชื่อมฐานข้อมูล (Turso/libSQL) และสร้างตาราง
- `routes/booking.js` เส้นทางสำหรับลูกค้า (ดูวันที่เปิด / จองคิว)
- `routes/admin.js` เส้นทางสำหรับแอดมิน (ล็อกอิน เปิดวัน ดูรายชื่อ ยกเลิกคิว)
- `middleware/auth.js` ตรวจโทเค็นแอดมิน
- `routes/docs.js` เส้นทางสำหรับใบเสนอราคา ใบวางบิล และตั้งค่าข้อมูลร้าน (แอดมินเท่านั้น)
- `lib/` ฟังก์ชันและคำสั่ง SQL ที่ใช้ร่วมกัน (`money.js` คำนวณยอดเงิน)
- `public/admin.html` หน้าแอดมินจัดการคิว เปิดที่ `/admin`
- `public/docs.html` หน้าจัดการใบเสนอราคา/ใบวางบิล เปิดที่ `/docs`
- `public/doc.html` หน้าเอกสารสำหรับพิมพ์ เปิดที่ `/doc?id=...`
- `data/` โฟลเดอร์ไฟล์ฐานข้อมูลสำหรับทดลองในเครื่อง

## ตัวแปรสภาพแวดล้อม (ตั้งบน Render ห้ามใส่ลงใน GitHub)

| ชื่อ | ความหมาย |
|---|---|
| `TURSO_DATABASE_URL` | ลิงก์ฐานข้อมูล Turso (ขึ้นต้น `libsql://`) |
| `TURSO_AUTH_TOKEN` | โทเค็นของฐานข้อมูลนี้ |
| `ADMIN_PASSWORD` | รหัสผ่านเข้าหน้าแอดมิน |
| `JWT_SECRET` | ข้อความสุ่มยาว ๆ สำหรับออกโทเค็นล็อกอิน |
| `CORS_ORIGIN` | ลิงก์เว็บมูนนอสที่อนุญาตให้เรียก API (คั่นหลายลิงก์ด้วย `,`) |

## เส้นทาง

- `GET /api/health` ตรวจว่าเซิร์ฟเวอร์ทำงาน
- `GET /api/booking` วันที่เปิดรับและคิวที่เหลือ
- `POST /api/booking` จองคิว
- `POST /api/admin/login` ล็อกอินแอดมิน
- `GET|PUT /api/admin/slots`, `DELETE /api/admin/slots/:date` จัดการวันที่เปิดรับ
- `GET /api/admin/bookings?date=YYYY-MM-DD` ดูรายชื่อ
- `POST /api/admin/bookings/:id/cancel` ยกเลิกคิว
- `GET|PUT /api/admin/settings` ข้อมูลร้านที่ขึ้นหัวเอกสาร
- `GET /api/admin/docs?type=quotation|billing` รายการเอกสาร
- `GET|PUT /api/admin/docs/:id`, `POST /api/admin/docs` ดู/แก้ไข/สร้างเอกสาร
- `POST /api/admin/docs/:id/status` เปลี่ยนสถานะ
- `POST /api/admin/docs/:id/to-billing` สร้างใบวางบิลจากใบเสนอราคา

## Render

- Build Command: `npm install`
- Start Command: `node server.js`
