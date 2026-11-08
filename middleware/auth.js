const jwt = require("jsonwebtoken");

// ตรวจโทเค็นแอดมินจากหัว Authorization: Bearer <token>
module.exports = function auth(req, res, next) {
  const t = (req.headers.authorization || "").replace(/^Bearer /, "");
  try {
    jwt.verify(t, process.env.JWT_SECRET);
    next();
  } catch (e) {
    res.status(401).json({ ok: false, error: "unauthorized" });
  }
};
