require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const { initDb } = require("./db");
const bookingRoutes = require("./routes/booking");
const adminRoutes = require("./routes/admin");
const docsRoutes = require("./routes/docs");

if (!process.env.ADMIN_PASSWORD || !process.env.JWT_SECRET) {
  console.error("ต้องตั้งค่า ADMIN_PASSWORD และ JWT_SECRET ก่อนเริ่มเซิร์ฟเวอร์");
  process.exit(1);
}

const app = express();
app.set("trust proxy", 1);

const allowedOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : true }));
// รูปลายเซ็นมีขนาดใหญ่กว่าข้อมูลทั่วไป จึงให้เส้นทางนี้รับได้ถึง 300kb (ส่วนอื่นยังจำกัด 20kb เหมือนเดิม)
app.use("/api/admin/signatures", express.json({ limit: "300kb" }));
app.use(express.json({ limit: "20kb", type: ["application/json", "text/plain"] }));

app.get("/api/health", (req, res) => res.json({ ok: true }));
app.use("/api/booking", bookingRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin", docsRoutes);

app.get("/admin", (req, res) => {
  res.set("X-Robots-Tag", "noindex");
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});
app.get("/docs", (req, res) => {
  res.set("X-Robots-Tag", "noindex");
  res.sendFile(path.join(__dirname, "public", "docs.html"));
});
app.get("/doc", (req, res) => {
  res.set("X-Robots-Tag", "noindex");
  res.sendFile(path.join(__dirname, "public", "doc.html"));
});
app.get("/logo.jpg", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "logo.jpg"));
});
app.get("/", (req, res) => res.type("text").send("moonnos-booking"));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ ok: false, error: "server" });
});

const PORT = process.env.PORT || 4000;

// ต้องรอสร้างตารางให้เสร็จก่อน ถึงจะเริ่มรับ request
async function start() {
  try {
    await initDb();
    console.log("[db] เชื่อมต่อฐานข้อมูลและเตรียมตารางเรียบร้อย");
    app.listen(PORT, () => console.log("moonnos-booking กำลังรันที่พอร์ต " + PORT));
  } catch (err) {
    console.error("[db] เชื่อมต่อฐานข้อมูลไม่สำเร็จ:", err);
    process.exit(1);
  }
}
start();
