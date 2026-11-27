// Chạy lúc ĐĂNG WEB (scripts/optimize_site.py) trên bản sao site/ – không sửa mã nguồn. Cần postcss@8 + postcss-selector-parser@7 (NODE_PATH).
// Vì sao: Chrome / Safari xếp mỗi luật CSS vào "ngăn" theo lớp / id / thẻ ở phần cuối bộ chọn; luật kết thúc bằng :is(A,B,…) hay :where(A,B,…) nhiều đối số
// không xếp được ngăn → bị thử với MỌI phần tử mỗi lần tính lại kiểu (đo 27/11/2026: ~30% thời gian so khớp bộ chọn của cả trang).
// Tách :is(A, B, …) / :where(A, B, …) ở phần CUỐI bộ chọn thành nhiều bộ chọn 1 đối số – trình duyệt xếp được vào "ngăn" theo lớp/thẻ
// (bộ chọn :is/:where nhiều đối số ở cuối bị thử với MỌI phần tử mỗi lần tính lại kiểu). Giữ nguyên độ ưu tiên (specificity):
//   :where → 0 như cũ · :is → bằng đối số mạnh nhất: nhánh yếu hơn được đệm :not(#_p) / :not(._p) / :not(p_) (không khớp gì, chỉ thêm độ ưu tiên)
const postcss = require("postcss"), sp = require("postcss-selector-parser");
const spec = (node) => {      // node: selector (container)
  let a = 0, b = 0, c = 0;
  node.walk((n) => {
    if (n.parent && n.parent.type === "pseudo" && n.parent !== node) return;      // đã tính trong pseudo cha
  });
  const one = (sel) => { let A = 0, B = 0, C = 0;
    for (const n of sel.nodes) {
      if (n.type === "id") A++; else if (n.type === "class" || n.type === "attribute") B++; else if (n.type === "tag" && n.value !== "*") C++;
      else if (n.type === "pseudo") { const v = n.value.toLowerCase();
        if (v === ":where") {} else if (v === ":is" || v === ":not" || v === ":has" || v === ":matches" || v === ":-webkit-any") { let m = [0, 0, 0]; for (const s of n.nodes) { const t = one(s); if (cmp(t, m) > 0) m = t; } A += m[0]; B += m[1]; C += m[2]; }
        else if (/^::/.test(v) || /^:(before|after|first-line|first-letter)$/.test(v)) { C++; }
        else if (/^:nth-(last-)?child$/.test(v)) { B++; /* "of S" hiếm – bỏ qua */ }
        else B++; } }
    return [A, B, C]; };
  return one(node); };
const cmp = (x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
const stats = { sel: 0, expanded: 0, skipped: 0 };
function rightCompound(sel) { const ns = sel.nodes; let i = ns.length; while (i > 0 && ns[i - 1].type !== "combinator") i--; return [i, ns.slice(i)]; }
function expandSel(s) {      // s: string → mảng chuỗi (1 nếu giữ nguyên)
  let out = null;
  sp((root) => { const sel = root.nodes[0]; if (!sel || root.nodes.length !== 1) return;
    const [i0, comp] = rightCompound(sel);
    if (comp.some((n) => n.type === "class" || n.type === "id" || n.type === "attribute" || (n.type === "tag" && n.value !== "*"))) return;      // đã có ngăn
    const fn = comp.find((n) => n.type === "pseudo" && /^:(is|where)$/i.test(n.value) && n.nodes.length > 1); if (!fn) return;
    if (comp.some((n) => n !== fn && n.type === "pseudo" && /^:(is|where)$/i.test(n.value) && n.nodes.length === 1)) { /* đã có 1 đối số khác cho ngăn */ return; }
    const isW = /where/i.test(fn.value), args = fn.nodes.map((a) => a.toString().trim());
    const sp0 = isW ? null : (() => { let m = [0, 0, 0]; for (const a of fn.nodes) { const t = spec(a); if (cmp(t, m) > 0) m = t; } return m; })();
    const res = []; let bad = false;
    for (const a of fn.nodes) {
      let pad = "";
      // :is(A,B) → :where(A)+đệm, :where(B)+đệm: :where = 0, phần đệm = đúng độ ưu tiên của đối số mạnh nhất → y hệt :is ban đầu, mọi nhánh
      if (!isW) pad = ":not(#_p)".repeat(sp0[0]) + ":not(._p)".repeat(sp0[1]) + ":not(p_)".repeat(sp0[2]);
      const cl = sel.clone(); const [j0] = rightCompound(cl); const f2 = cl.nodes.slice(j0).find((n) => n.type === "pseudo" && n.value === fn.value && n.toString() === fn.toString());
      const rep = sp.pseudo({ value: fn.value }); rep.append(sp.selector({ nodes: [] })); f2.replaceWith(sp.string({ value: `:where(${a.toString().trim()})${pad}` }));
      res.push(cl.toString().trim()); }
    if (bad) { stats.skipped++; return; }
    out = res; }).processSync(s);
  if (out) stats.expanded++; return out || [s];
}
module.exports = function bucket(css) {
  const root = postcss.parse(css);
  root.walkRules((r) => { if (r.parent?.type === "atrule" && /keyframes/i.test(r.parent.name)) return;
    let sels; try { sels = r.selectors; } catch (e) { return; } const out = []; let ch = false;
    for (const s of sels) { stats.sel++; let e; try { e = expandSel(s); } catch (x) { e = [s]; } if (e.length > 1 || e[0] !== s) ch = true; out.push(...e); }
    if (ch) r.selectors = [...new Set(out)]; });
  return { css: root.toString(), stats };
};
if (require.main === module) { const fs = require("fs"), f = process.argv[2], o = process.argv[3] || f, s = fs.readFileSync(f, "utf8"), r = module.exports(s);
  fs.writeFileSync(o, r.css); console.log(`tách :is/:where cuối bộ chọn (app.css): ${r.stats.expanded} bộ chọn → xếp ngăn được · ${(s.length / 1024).toFixed(0)} → ${(r.css.length / 1024).toFixed(0)} KB`); }
