const sat = (n) => Math.round(Number(n) * 100);

// คำนวณยอดเป็นสตางค์ เพื่อไม่ให้ทศนิยมเพี้ยน
function calc(items, discount, vatPercent) {
  const sub = items.reduce((a, it) => a + Math.round(Number(it.qty) * sat(it.price)), 0);
  const disc = Math.min(sat(discount || 0), sub);
  const base = sub - disc;
  const vat = Math.round((base * Number(vatPercent || 0)) / 100);
  return { subtotal: sub / 100, discount: disc / 100, vat_amount: vat / 100, total: (base + vat) / 100 };
}

module.exports = { calc };
