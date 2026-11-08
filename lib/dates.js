// วันที่ตามเวลาประเทศไทย รูปแบบ YYYY-MM-DD
const fmtDay = (ms) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
const today = () => fmtDay(Date.now());
const isDate = (s) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;

module.exports = { fmtDay, today, isDate };
