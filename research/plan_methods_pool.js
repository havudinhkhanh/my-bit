// Kiểm chứng GỘP các cách đánh mới của trang Lên kế hoạch (SMC tuần, Kỹ thuật) trên toàn bộ coin có trong site/data/c/*.json
// (chính các hàm của site/app-plan.js, nạp nguyên văn) → in bảng so sánh vài biến thể tham số.
// Chạy: node research/plan_methods_pool.js <thư mục data/c>
const fs = require("fs"), path = require("path"), vm = require("vm");
const dir = process.argv[2] || "site/data/c";
const src = fs.readFileSync(path.join(__dirname, "../site/app-plan.js"), "utf8");
const pick = (name) => { const i = src.indexOf(`function ${name}(`); if (i < 0) throw new Error(name); let d = 0, j = src.indexOf("{", i); for (let k = j; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) return src.slice(i, k + 1); } } };
const ctx = { isNum: (x) => typeof x === "number" && isFinite(x), bi: (a) => a, console };
vm.createContext(ctx);
const kp = src.slice(src.indexOf("const KHP = "), src.indexOf("\n", src.indexOf("const KHP = ")));
vm.runInContext(kp.replace("const KHP", "this.KHP") + "\n" + ["khEma", "khRsi", "khAtr", "khHist", "khWeek", "khStruct", "khSmcAt", "khSmcBt", "khBtSum", "khTI", "khTechSig", "khTechLv", "khTechBt"].map(pick).join("\n") + "\nthis.F={khWeek,khStruct,khSmcBt,khAtr,khTI,khTechBt,khBtSum};", ctx);
const F = ctx.F, KHP = ctx.KHP, files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
const DATA = []; for (const f of files) { try { const D = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); const B = D.ohlc?.d; if (B?.c?.length >= 260) DATA.push({ B, W: F.khWeek(B), I: F.khTI(B) }); } catch (e) { /* bỏ qua */ } }
const base = JSON.parse(JSON.stringify(KHP));
const run = (kind, label, patch) => {
  Object.assign(KHP.smc, base.smc); Object.assign(KHP.tech, base.tech); Object.assign(KHP[kind], patch);
  const a = { n: 0, w1: 0, R: 0, h1: 0, h2: 0 }, half = [{ n: 0, R: 0 }, { n: 0, R: 0 }];
  for (const x of DATA) {
    let s;
    if (kind === "smc") { if (x.W.c.length < 30) continue; const S = F.khStruct(x.W), A = F.khAtr(x.W); s = F.khSmcBt(x.W, S, A, x.B); }
    else s = F.khTechBt(x.B, x.I);
    if (!s.n) continue; a.n += s.n; a.w1 += s.win1 / 100 * s.n; a.R += s.avgR * s.n;
  }
  console.log(kind.padEnd(5), label.padEnd(34), JSON.stringify({ n: a.n, win1: +(a.w1 / a.n * 100).toFixed(1), avgR: +(a.R / a.n).toFixed(3) }));
};
if (process.argv[3] === "pool") {      // số gộp cho KH_POOL trong site/app-plan.js (bộ tham số mặc định, tách Long / Short)
  const out = { coins: DATA.length };
  for (const kind of ["smc", "tech"]) { out[kind] = {}; for (const [nm, sd] of [["all", 0], ["L", 1], ["S", -1]]) { Object.assign(KHP.smc, base.smc); Object.assign(KHP.tech, base.tech); KHP[kind].side = sd; let n = 0, w1 = 0, w2 = 0, R = 0;
    for (const x of DATA) { let st; if (kind === "smc") { if (x.W.c.length < 30) continue; st = F.khSmcBt(x.W, F.khStruct(x.W), F.khAtr(x.W), x.B); } else st = F.khTechBt(x.B, x.I); if (!st.n) continue; n += st.n; w1 += st.win1 / 100 * st.n; w2 += st.win2 / 100 * st.n; R += st.avgR * st.n; }
    out[kind][nm] = { n, win1: +(w1 / n * 100).toFixed(1), win2: +(w2 / n * 100).toFixed(1), avgR: +(R / n).toFixed(3) }; } }
  console.log(JSON.stringify(out)); process.exit(0);
}
const V = process.argv[3] ? JSON.parse(process.argv[3]) : [["smc", "mặc định", {}], ["tech", "mặc định", {}]];
for (const [k, l, p] of V) run(k, l, p);
