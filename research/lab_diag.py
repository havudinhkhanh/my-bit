"""MỔ XẺ xmom14 (động lượng chéo 2 tuần) – phản biện độc lập trước khi tin kết quả của phòng thử nghiệm (research/lab.py).
Dùng ĐÚNG bộ nạp dữ liệu + khung tính lời/lỗ của lab.py (cùng hàm, cùng LAB_CACHE), in báo cáo markdown ra stdout:
  0. kiểm dữ liệu (lỗ hổng, funding, danh mục hiện tại)   1. chân Long / chân Short so với thị trường (có phải chỉ là "bán khống altcoin lúc alt giảm"?)
  2. độ nhạy tham số (số ngày nhìn lại × số mã × cách chia nhóm × thứ đổi danh mục), phí ×2 ×3, khớp trễ 1 ngày, giữ nguyên cả tuần
  3. độ tập trung (mã nào, ngày nào làm ra lời; bỏ 5 mã tốt nhất; bỏ ngày có mã chạy > ±60%)   4. độ bền theo quý, Sharpe 180 ngày
  5. sức chứa (khối lượng của các mã đang giữ)   6. lời còn không khi bỏ phần may rủi: bỏ mã không phải crypto
  (cổ phiếu / vàng / dầu niêm yết 2026), chia 7 phần theo thứ, lệnh nhỏ cho mã giật mạnh   7. so với danh mục chọn NGẪU NHIÊN (mức nhiễu)   8. soi kỹ bản "cứng" (ứng viên id mới).
Kiểm NGOÀI MẪU LÙI: đặt LAB_START=2021-01 và LAB_EVAL=2021-07-01 → báo cáo thêm giai đoạn trước 07/2023 (xmom14 được chọn trên 07/2023 → nay).
Không đổi tham số của phương pháp, không đặt lệnh. Chạy: python research/lab_diag.py   (máy không có mạng: python research/lab_diag.py --synthetic)"""
import os
import sys

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
os.environ.setdefault("RS_LOG", "lab_diag.log")
import lab as L  # noqa: E402
import lab_methods as LM  # noqa: E402

P = L.log
WD = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"]


# ---------------------------------------------------------------- dữ liệu & công cụ
def load():
    """Y hệt phần nạp dữ liệu trong lab.main()."""
    if "--synthetic" in sys.argv: return L.synthetic()
    E = L.E; syms = [s for s in E.list_symbols() if s not in L.SKIP]; P(f"{len(syms)} mã futures USDT · {L.START} → {L.TODAY}")
    parts, top = [], None
    for m in L.month_list():
        p = L.load_month(m, syms, top)
        if p[4]:
            v = np.nansum(p[1]["q"], 0); top = [p[0][j] for j in np.argsort(-v)[:160]]
        P(f"  {m}: {len(p[0])} mã{'' if p[4] else ' (tệp ngày)'}"); parts.append(p)
    return L.build(parts)


def sig_of(D, lb):
    C = pd.DataFrame(D.C); return (C.shift(1) / C.shift(lb + 1) - 1).values      # lợi suất lb ngày tính tới hôm trước (lb = 14 → đúng xmom14)


def ls_w(D, sig, reb, top=40, q=5, k=None, iv=None):
    """Như lab_methods._ls, thêm k = số mã CỐ ĐỊNH mỗi bên (k=None → chia q nhóm như bản gốc); iv[ngày, mã] = 1/biến động → mã càng giật thì lệnh càng nhỏ (iv=None: chia đều)."""
    W = np.zeros((D.nd, D.S)); w = np.zeros(D.S)
    for d in range(1, D.nd):
        if reb[d]:
            s = np.where((D.rank[d] < top) & np.isfinite(sig[d]), sig[d], np.nan); ok = np.nonzero(np.isfinite(s))[0]
            if len(ok) >= (2 * k if k else 2 * q):
                n = k or max(1, len(ok) // q); o = ok[np.argsort(s[ok])]; w = np.zeros(D.S); hi, lo = o[-n:], o[:n]
                if iv is None: w[hi] = 0.5 / n; w[lo] = -0.5 / n
                else: w[hi] = 0.5 * iv[d, hi] / iv[d, hi].sum(); w[lo] = -0.5 * iv[d, lo] / iv[d, lo].sum()
        w = np.where(np.isfinite(D.O[d]), w, 0.0); W[d] = w
    return W


def net_of(D, W, cm=1.0, drift=True, fund=1.0):
    g, c, f, _, _ = L.pnl(D, W, drift); return (g - cm * c + fund * f)[D.ev0:]


def lag(D, W, k):
    W2 = np.zeros_like(W); W2[k:] = W[:-k]; return np.where(np.isfinite(D.O), W2, 0.0)


def hold(D, W, reb):
    """GIỮ NGUYÊN vị thế giữa hai lần đổi danh mục (không kéo tỉ trọng về mỗi ngày): số coin cố định, tỉ trọng trôi theo giá – đúng cách bot thật sẽ làm."""
    W = np.nan_to_num(W); F = np.nan_to_num(D.F); h = np.zeros(D.S); eq = 1.0; out = np.zeros(D.nd); expo = np.zeros(D.nd)
    for d in range(D.nd):
        tgt = W[d] * eq if reb[d] else np.where(W[d] == 0, 0.0, h)
        cost = (np.abs(tgt - h) * D.cost[d]).sum(); h = tgt
        r = ((h * D.R[d]).sum() - cost - (h * F[d]).sum()) / eq; out[d] = r; expo[d] = np.abs(h).sum() / eq
        h = h * (1 + D.R[d]); eq *= 1 + r
        if eq <= 0: break
    return out[D.ev0:], expo[D.ev0:]


def v30_of(D):
    return pd.DataFrame(D.Q).where(np.isfinite(D.C)).rolling(30, min_periods=20).mean().shift(1).values      # như lab.finish


def sub(D, drop):
    """Bản sao của D với rổ đã BỎ các mã `drop` – xếp hạng khối lượng + mức phí tính lại đúng như lab.finish."""
    import copy
    D2 = copy.copy(D); v30 = v30_of(D); D2.elig = D.elig & ~drop
    D2.rank = np.argsort(np.argsort(-np.where(D2.elig, v30, -1), 1), 1).astype(float); D2.rank[~D2.elig] = np.inf; D2.cost = np.where(D2.rank < 10, 0.0006, 0.0010)
    return D2


def tradfi(D):
    """Mã KHÔNG phải crypto (cổ phiếu, ETF, vàng, dầu… niêm yết dạng futures USDT từ 2026): cuối tuần thị trường gốc đóng cửa nên khối lượng & biên độ
    thứ Bảy–Chủ nhật rất thấp. Nhận diện bằng số liệu (đặc tính cố định của mã, không phải tín hiệu giao dịch) – danh sách được in ra để soát bằng mắt."""
    we = D.wd >= 5; ok = np.isfinite(D.C) & np.isfinite(D.O); q = np.where(ok, np.nan_to_num(D.Q), 0.0); a = np.where(ok, np.abs(D.R), np.nan)
    vs = q[we].sum(0) / np.maximum(q.sum(0), 1e-9); n = ok.sum(0)
    with np.errstate(all="ignore"): rr = np.nanmean(a[we], 0) / np.nanmean(a[~we], 0)
    return (n >= 28) & (vs < 0.12) & (rr < 0.45), vs, rr


def st(x):
    x = np.asarray(x, float)
    if len(x) < 5: return dict(day=0.0, yr=0.0, sh=0.0, dd=0.0, d365=0.0, n=len(x))
    m = x.mean(); sd = x.std(ddof=1) or 1e-12
    return dict(day=m * 100, yr=m * 36500, sh=m / sd * np.sqrt(365), dd=L._dd(x) * 100, d365=float((1 + x[-365:]).prod() - 1) * 100, n=len(x))


def cells(x):
    s = st(x); return f"{s['sh']:+.2f} | {s['yr']:+.0f} | {s['dd']:.0f} | {s['d365']:+.0f}"


def tbl(head, rows):
    h = " | ".join(head); P("| " + h + " |"); P("|" + "---|" * (h.count("|") + 1))
    for r in rows: P("| " + " | ".join(str(v) for v in r) + " |")
    P("")


def ols(y, X):
    """y = a + X·b → (a, b, t của a, R²)"""
    A = np.column_stack([np.ones(len(y)), X]); b, *_ = np.linalg.lstsq(A, y, rcond=None); e = y - A @ b
    s2 = e @ e / max(1, len(y) - A.shape[1]); cov = s2 * np.linalg.pinv(A.T @ A); r2 = 1 - e.var() / (y.var() or 1e-12)
    return b[0], b[1:], b[0] / (np.sqrt(cov[0, 0]) or 1e-12), r2


def book(D, sig, top=40, q=5, iv=None):
    """Danh mục 7 PHẦN: mỗi phần 1/7 vốn, đổi danh mục vào 1 thứ khác nhau → mỗi ngày chỉ thay ~1/7, kết quả không còn phụ thuộc may rủi chọn thứ."""
    return np.mean([ls_w(D, sig, D.wd == k, top=top, q=q, iv=iv) for k in range(7)], 0)


def mini(D, W, mk, title):
    """Soi 1 danh mục W trên dữ liệu D (rổ đã lọc): theo năm / quý, hai chân, tập trung, đuôi, phí, trễ, funding. mk(lb, top) → danh mục cùng cách dựng với tham số khác."""
    ev = D.ev0; dates = D.dates[ev:]; yrs = dates.year.values; Y = sorted(set(yrs)); R = D.R; F = np.nan_to_num(D.F); S = D.S
    ysum = lambda x: " · ".join(f"{y}: {x[yrs == y].sum() * 100:+.0f}" for y in Y)  # noqa: E731
    pre = yrs < 2025; shp = lambda x: f"{st(x[pre])['sh']:+.2f} | {st(x[~pre])['sh']:+.2f}" if pre.sum() > 5 and (~pre).sum() > 5 else "– | –"  # noqa: E731
    g, c, f, expo, turn = L.pnl(D, W); net = (g - c + f)[ev:]; b = st(net); Cm = L.trades(D, W) * D.cost; N = (W * R - Cm - W * F)[ev:]; sg = np.sign(W); sgc = np.where(sg != 0, sg, np.vstack([np.zeros((1, S)), sg[:-1]]))[ev:]
    P(f"\n## 8. Soi kỹ {title}")
    P(f"- {b['day']:+.4f}%/ngày · {b['yr']:+.1f}%/năm · Sharpe {b['sh']:.2f} · sụt {b['dd']:.1f}% · 365 ngày {b['d365']:+.1f}% · t = {net.mean() / (net.std(ddof=1) or 1e-12) * np.sqrt(len(net)):.2f} · "
      f"gộp {g[ev:].mean() * 100:+.4f} · phí {c[ev:].mean() * 100:.4f} · funding {f[ev:].mean() * 100:+.4f} %/ngày · xoay vòng {turn[ev:].mean() * 100:.1f}%/ngày · vị thế gộp {expo[ev:].mean() * 100:.0f}%")
    P(f"- Theo năm (cộng %): {ysum(net)} | chân Long: {ysum((N * (sgc > 0)).sum(1))} | chân Short: {ysum((N * (sgc < 0)).sum(1))} | funding: {ysum(f[ev:])}")
    inU = D.rank < 40; mkt = ((R * inU).sum(1) / np.maximum(inU.sum(1), 1))[ev:]; a, be, ta, r2 = ols(g[ev:], mkt[:, None])
    P(f"- Beta với thị trường {be[0]:+.2f} (tương quan {np.corrcoef(g[ev:], mkt)[0, 1]:+.2f}) · alpha gộp {a * 36500:+.0f}%/năm (t = {ta:.2f})")
    s = pd.Series(net, index=dates); qa = np.array([f"{y}Q{q}" for y, q in zip(dates.year, dates.quarter)]); qs = sorted(set(qa)); qr = [float((1 + net[qa == q]).prod() - 1) * 100 for q in qs]
    P(f"- Theo quý (ròng %, {sum(r > 0 for r in qr)}/{len(qs)} quý lời): " + " · ".join(f"{q[2:]} {r:+.0f}" for q, r in zip(qs, qr)))
    rs = (s.rolling(180).mean() / s.rolling(180).std() * np.sqrt(365)).dropna().values
    if len(rs): P(f"- Sharpe trượt 180 ngày: thấp nhất {rs.min():+.2f} · 10% thấp {np.percentile(rs, 10):+.2f} · trung vị {np.median(rs):+.2f} · {(rs < 0).mean() * 100:.0f}% cửa sổ âm | ngày xấu nhất {net.min() * 100:+.1f}% · tuần {s.rolling(7).sum().min() * 100:+.1f}% · tháng {s.rolling(30).sum().min() * 100:+.1f}%")
    tot = N.sum() or 1e-12; cs = N.sum(0); o = np.argsort(-cs); ex = (np.abs(R) > 0.6) & np.isfinite(D.O); up = (R > 0.6)[ev:]; hw = W[ev:]
    P(f"- Tập trung: {int((hw != 0).any(0).sum())} mã từng giữ · 5 mã tốt nhất = {cs[o[:5]].sum() / tot * 100:.0f}% tổng lời · 15 mã = {cs[o[:15]].sum() / tot * 100:.0f}% · " + " · ".join(f"{D.syms[j].replace('USDT', '')} {cs[j] * 100:+.0f}" for j in o[:8])
      + " | lỗ nhất: " + " · ".join(f"{D.syms[j].replace('USDT', '')} {cs[j] * 100:+.0f}" for j in o[::-1][:4]))
    P(f"- Mã tăng > 60%/ngày: bên Long {int((up & (hw > 0)).sum())} lần ({(N * (up & (hw > 0))).sum() * 100:+.0f} điểm) · bên Short {int((up & (hw < 0)).sum())} lần ({(N * (up & (hw < 0))).sum() * 100:+.0f} điểm) · cú lỗ lớn nhất của 1 mã trong 1 ngày {N.min() * 100:+.1f} điểm")
    Wz = W.copy(); Wz[:, o[:5]] = 0; d1 = ~(ex & (W != 0)).any(1)[ev:]; k20 = np.sort(net)[:-20]; rows = [["bản này", cells(net), shp(net)], ["xoá vị thế ở 5 mã tốt nhất", cells(net_of(D, Wz)), shp(net_of(D, Wz))],
        [f"bỏ {int((~d1).sum())} ngày có mã đang giữ chạy > ±60%", cells(net[d1]), "– | –"], ["bỏ 20 ngày tốt nhất", f"– | {k20.mean() * 36500:+.0f} | – | –", "– | –"]]
    rows += [[f"phí × {k}", cells(x), shp(x)] for k in (2, 3) for x in [net_of(D, W, cm=k)]] + [[f"khớp trễ {k} ngày", cells(x), shp(x)] for k in (1, 2) for x in [net_of(D, lag(D, W, k))]]
    x = net_of(D, W, fund=0.0); rows.append(["không tính funding", cells(x), shp(x)]); Rc = D.R; D.R = np.clip(Rc, -0.3, 0.3); x = net_of(D, W); D.R = Rc; rows.append(["cắt biến động ngày của 1 mã về ±30%", cells(x), shp(x)])
    for lb, top in ((7, 40), (10, 40), (21, 40), (28, 40), (14, 20), (14, 60)): x = net_of(D, mk(lb, top)); rows.append([f"cùng cách dựng, nhìn lại {lb} ngày, {top} mã", cells(x), shp(x)])
    tbl(["thử", "Sharpe | %/năm | sụt % | 365 ngày %", "Sharpe ≤2024 | ≥2025"], rows)
    rng = np.random.default_rng(5); pg = np.array([st(L.pnl(D, mk(None, 40, rng.normal(size=(D.nd, S))), drift=False)[0][ev:])["sh"] for _ in range(40)]); bg = st(g[ev:])["sh"]
    P(f"- So với 40 danh mục NGẪU NHIÊN cùng cách dựng: Sharpe gộp TB {pg.mean():+.2f}, độ lệch chuẩn {pg.std():.2f}, cao nhất {pg.max():+.2f} → bản này {bg:+.2f} (z = {(bg - pg.mean()) / (pg.std() or 1e-12):+.1f})")
    return net


# ---------------------------------------------------------------- báo cáo
def report(D):
    ev = D.ev0; dates = D.dates[ev:]; yrs = dates.year.values; Y = sorted(set(yrs)); S = D.S; reb = D.wd == 0
    sig = sig_of(D, 14); W = ls_w(D, sig, reb)
    assert np.array_equal(W, LM._ls(D, (pd.DataFrame(D.C).shift(1) / pd.DataFrame(D.C).shift(15) - 1).values, reb)), "ls_w lệch lab_methods._ls"
    R = D.R; F = np.nan_to_num(D.F); g, c, f, expo, turn = L.pnl(D, W); net = (g - c + f)[ev:]
    g0, c0, f0, _, turn0 = L.pnl(D, W, drift=False)
    ysum = lambda x: [f"{x[yrs == y].sum() * 100:+.1f}" for y in Y]  # noqa: E731
    b = st(net)
    P(f"\n# Mổ xẻ xmom14 · {dates[0].date()} → {dates[-1].date()} · {len(net)} ngày · {S} mã\n")
    P(f"Cơ sở (đã tính phí kéo tỉ trọng mỗi ngày): {b['day']:+.4f}%/ngày · {b['yr']:+.1f}%/năm · Sharpe {b['sh']:.2f} · sụt {b['dd']:.1f}% · 365 ngày {b['d365']:+.1f}% · "
      f"gộp {g[ev:].mean() * 100:+.4f} · phí {c[ev:].mean() * 100:.4f} · funding {f[ev:].mean() * 100:+.4f} %/ngày · xoay vòng {turn[ev:].mean() * 100:.1f}%/ngày")
    o = st((g0 - c0 + f0)[ev:])
    P(f"Như lab chấm lần đầu (KHÔNG tính phí kéo tỉ trọng): {o['day']:+.4f}%/ngày · {o['yr']:+.1f}%/năm · Sharpe {o['sh']:.2f} · phí {c0[ev:].mean() * 100:.4f}%/ngày · xoay vòng {turn0[ev:].mean() * 100:.1f}%/ngày"
      f" → phí bị tính thiếu {(c - c0)[ev:].mean() * 36500:.1f}%/năm\n")

    # ---------- 0. kiểm dữ liệu
    P("## 0. Kiểm dữ liệu")
    fin = np.isfinite(D.C); first = fin.argmax(0); last = D.nd - 1 - fin[::-1].argmax(0); held = (W[ev:] != 0).any(0); gaps = []
    for j in np.nonzero(fin.any(0))[0]:
        x = ~fin[first[j]:last[j] + 1, j]
        if x.any():
            i = np.nonzero(np.diff(np.concatenate([[0], x.astype(int), [0]])))[0]; runs = [(first[j] + a, b_ - a) for a, b_ in zip(i[::2], i[1::2])]
            gaps.append((D.syms[j], bool(held[j]), runs))
    ng = sum(len(r) for _, _, r in gaps); gh = [(s, r) for s, h, r in gaps if h]
    P(f"- Mã có lỗ hổng dữ liệu giữa chừng: {len(gaps)} mã, {ng} đoạn; trong đó {len(gh)} mã xmom14 từng giữ"
      + (": " + "; ".join(f"{s} " + ",".join(f"{D.dates[a].date()}+{n}d" for a, n in r[:3]) for s, r in gh[:12]) if gh else ""))
    hm = W[ev:] != 0; fc = np.isfinite(D.F[ev:])
    P("- Funding có số liệu cho " + " · ".join(f"{y}: {fc[yrs == y][hm[yrs == y]].mean() * 100:.0f}%" for y in Y if hm[yrs == y].any()) + f" số (mã × ngày) đang giữ; funding tới {D.dates[max(D.fund_until, 0)].date()} (sau đó coi = 0)")
    ex = (np.abs(R) > 0.6) & np.isfinite(D.O); ex[:ev] = False
    P(f"- Số lần 1 mã chạy > ±60% trong 1 ngày (mở → mở): {int(ex.sum())} trên mọi mã, {int((ex & (D.rank < 40)).sum())} trong 40 mã lớn, {int((ex & (W != 0)).sum())} khi xmom14 đang giữ")
    Nn = (W * R - L.trades(D, W) * D.cost - W * F)[ev:]; gone = last < D.nd - 40; lw = (np.arange(D.nd)[:, None] > last[None, :] - 7)[ev:] & gone[None, :]; hw = W[ev:]
    P(f"- Mã đã HUỶ niêm yết (hết dữ liệu trước cuối kỳ > 40 ngày): {int(gone.sum())} mã, xmom14 từng giữ {int((gone & held).sum())}; lời/lỗ trong 7 ngày CUỐI trước khi huỷ: "
      f"bên Long {(Nn * lw * (hw > 0)).sum() * 100:+.1f} điểm ({int((lw & (hw > 0)).any(0).sum())} mã) · bên Short {(Nn * lw * (hw < 0)).sum() * 100:+.1f} điểm ({int((lw & (hw < 0)).any(0).sum())} mã)")
    bd = D.fund_until + 1
    if 0 < bd < D.nd: P(f"- Chỗ nối tệp tháng → tệp ngày ({D.dates[bd].date()}): {int(np.isfinite(D.O[bd - 1]).sum())} → {int(np.isfinite(D.O[bd]).sum())} mã; {int(((W[bd - 1] != 0) & ~np.isfinite(D.O[bd])).sum())} vị thế đang giữ bị cắt vì mã không nằm trong nhóm tải tệp ngày")
    dl = [d for d in range(D.nd - 1, 0, -1) if reb[d]][:1]
    if dl:
        d = dl[0]; P(f"- Danh mục lần đổi gần nhất {D.dates[d].date()}: MUA " + " ".join(D.syms[j].replace("USDT", "") for j in np.nonzero(W[d] > 0)[0]) + " · BÁN " + " ".join(D.syms[j].replace("USDT", "") for j in np.nonzero(W[d] < 0)[0]))
        P("- 40 mã lớn hôm đó: " + " ".join(D.syms[j].replace("USDT", "") for j in np.argsort(D.rank[d])[:40] if np.isfinite(D.rank[d, j])))
    P("")

    # ---------- 1. hai chân
    P("## 1. Chân Long / chân Short")
    G = W * R; Fm = -W * F; Cm = L.trades(D, W) * D.cost; sg = np.sign(W); sgc = np.where(sg != 0, sg, np.vstack([np.zeros((1, S)), sg[:-1]]))
    N = (G - Cm + Fm)[ev:]; rows = []
    for nm, m, mc in (("Long", sg > 0, sgc > 0), ("Short", sg < 0, sgc < 0), ("Cộng", sg != 0, sgc != 0)):
        gg, ff, cc = (G * m).sum(1)[ev:], (Fm * m).sum(1)[ev:], (Cm * mc).sum(1)[ev:]; n = gg + ff - cc
        rows.append([nm, f"{gg.mean() * 100:+.4f}", f"{ff.mean() * 100:+.4f}", f"{cc.mean() * 100:.4f}", f"{n.mean() * 100:+.4f}", f"{n.mean() * 36500:+.1f}"] + ysum(n))
    P("Đóng góp vào lời của cả danh mục (% vốn; theo năm = CỘNG lời ngày, không lãi kép):")
    tbl(["chân", "gộp %/ngày", "funding %/ngày", "phí %/ngày", "ròng %/ngày", "ròng %/năm"] + [str(y) for y in Y], rows)
    fL = (Fm * (sg > 0)).sum(1)[ev:]; fS = (Fm * (sg < 0)).sum(1)[ev:]; fs = Fm[ev:].sum(0); fo = np.argsort(-fs); fx = np.abs(F[ev:]) > 0.005
    P("- Funding theo năm (điểm % vốn): Long " + " · ".join(f"{y}: {v}" for y, v in zip(Y, ysum(fL))) + " | Short " + " · ".join(f"{y}: {v}" for y, v in zip(Y, ysum(fS))))
    P(f"- Funding cả kỳ {fs.sum() * 100:+.1f} điểm, trong đó {(Fm[ev:] * fx).sum() * 100:+.1f} điểm đến từ những ngày funding của mã vượt ±0,5%/ngày ({int((fx & (W[ev:] != 0)).sum())} lượt mã × ngày); "
      "lớn nhất: " + " · ".join(f"{D.syms[j].replace('USDT', '')} {fs[j] * 100:+.1f}" for j in fo[:6]) + " | âm nhất: " + " · ".join(f"{D.syms[j].replace('USDT', '')} {fs[j] * 100:+.1f}" for j in fo[::-1][:3]) + "\n")
    inU = D.rank < 40; mkf = (R * inU).sum(1) / np.maximum(inU.sum(1), 1); mkt = mkf[ev:]; btc = R[ev:, D.ix["BTCUSDT"]]
    wl = np.maximum(W, 0); ws = np.minimum(W, 0); rl = ((wl * R).sum(1) / np.maximum(wl.sum(1), 1e-12))[ev:]; rs = ((ws * R).sum(1) / np.minimum(ws.sum(1), -1e-12))[ev:]
    P("Lợi suất GIÁ của từng rổ (trên 100% tiền của rổ, chưa phí/funding) so với thị trường = 40 mã lớn chia đều (cộng lời ngày, %):")
    rows = [[nm] + ysum(x) + [f"{x.sum() * 100:+.0f}", f"{x.mean() * 100:+.3f}"] for nm, x in (
        ("Thị trường 40 mã (chia đều)", mkt), ("BTC", btc), ("Rổ Long (mã mạnh)", rl), ("Rổ Short (mã yếu) – giá", rs),
        ("Long − thị trường", rl - mkt), ("Thị trường − rổ Short", mkt - rs), ("xmom14 gộp = (Long − Short)/2", (rl - rs) / 2))]
    tbl(["rổ"] + [str(y) for y in Y] + ["cả kỳ", "%/ngày"], rows)
    gs = g[ev:]; a, be, ta, r2 = ols(gs, mkt[:, None]); a2, be2, ta2, r22 = ols(gs, np.column_stack([mkt, mkt - btc]))
    bl = ols(rl, mkt[:, None])[1][0]; bsh = ols(rs, mkt[:, None])[1][0]
    P(f"- Beta với thị trường: rổ Long {bl:.2f} · rổ Short {bsh:.2f} · cả danh mục {be[0]:+.2f} (R² {r2:.2f}); tương quan với thị trường {np.corrcoef(gs, mkt)[0, 1]:+.2f}, với BTC {np.corrcoef(gs, btc)[0, 1]:+.2f}")
    P(f"- Lời GỘP sau khi trừ phần do thị trường: alpha {a * 100:+.4f}%/ngày ({a * 36500:+.1f}%/năm, t = {ta:.2f}); 2 nhân tố [thị trường, alt − BTC]: alpha {a2 * 100:+.4f}%/ngày (t = {ta2:.2f}), beta {be2[0]:+.2f} / {be2[1]:+.2f}")
    tr30 = pd.Series(mkf).rolling(30).sum().shift(1).values[ev:]
    for nm, m in (("thị trường 30 ngày trước TĂNG", tr30 > 0), ("thị trường 30 ngày trước GIẢM", tr30 <= 0)):
        if m.sum() > 5: P(f"- Khi {nm}: {int(m.sum())} ngày · ròng {net[m].mean() * 100:+.3f}%/ngày · Sharpe {st(net[m])['sh']:+.2f} · chân Long−TT {(rl - mkt)[m].mean() * 100:+.3f} · TT−Short {(mkt - rs)[m].mean() * 100:+.3f} %/ngày")
    age = np.isfinite(D.C).cumsum(0); age = np.vstack([np.zeros((1, S)), age[:-1]]); rows = []
    for nm, m in (("< 90 ngày", age < 90), ("90–365 ngày", (age >= 90) & (age < 365)), ("≥ 365 ngày", age >= 365)):
        x = (G - Cm + Fm) * m; rows.append([nm, f"{(x * (sgc > 0))[ev:].sum() * 100:+.0f}", f"{(x * (sgc < 0))[ev:].sum() * 100:+.0f}", f"{(m & (W != 0))[ev:].sum() / max(1, (W != 0)[ev:].sum()) * 100:.0f}%"])
    P("\nTheo TUỔI niêm yết của mã đang giữ (điểm % vốn cộng dồn cả kỳ; dữ liệu bắt đầu 01/2023 nên mã cũ hơn bị tính tuổi từ đó):")
    tbl(["tuổi mã", "Long", "Short", "tỉ lệ (mã × ngày)"], rows)

    # ---------- 2. độ nhạy
    P("## 2. Độ nhạy tham số (ròng sau phí + funding, đổi danh mục thứ Hai)")
    pre = yrs < 2025; shp = lambda x: f"{st(x[pre])['sh']:+.2f} | {st(x[~pre])['sh']:+.2f}" if pre.sum() > 5 and (~pre).sum() > 5 else "– | –"  # noqa: E731
    grid = {}; rows = []; sigs = {lb: sig_of(D, lb) for lb in (7, 10, 14, 21, 28)}
    for top in (20, 40, 60):
        for qn, kw in (("5 nhóm", dict(q=5)), ("10 nhóm", dict(q=10)), ("5 mã", dict(k=5))):
            for lb in (7, 10, 14, 21, 28):
                x = net_of(D, ls_w(D, sigs[lb], reb, top=top, **kw)); grid[(lb, top, qn)] = st(x)["sh"]
                rows.append([f"{lb}{' ◀' if (lb, top, qn) == (14, 40, '5 nhóm') else ''}", top, qn, cells(x), shp(x)])
    tbl(["nhìn lại (ngày)", "số mã", "chia", "Sharpe | %/năm | sụt % | 365 ngày %", "Sharpe ≤2024 | ≥2025"], rows)
    v = np.array(list(grid.values())); bs = grid[(14, 40, "5 nhóm")]
    nb = [s for (lb, top, qn), s in grid.items() if ((lb != 14) + (top != 40) + (qn != "5 nhóm")) == 1]
    P(f"**Cơ sở Sharpe {bs:+.2f} xếp thứ {int((v > bs).sum()) + 1}/{len(v)}** · trung vị cả lưới {np.median(v):+.2f} · thấp nhất {v.min():+.2f} · cao nhất {v.max():+.2f} · "
      f"{(v >= 1).mean() * 100:.0f}% ô ≥ 1,0 · {(v >= 0.5).mean() * 100:.0f}% ô ≥ 0,5 · {(v < 0).mean() * 100:.0f}% ô âm · {len(nb)} hàng xóm sát (đổi 1 tham số): trung bình {np.mean(nb):+.2f}, thấp nhất {np.min(nb):+.2f}\n")
    P("Theo THỨ đổi danh mục (cấu hình cơ sở):")
    tbl(["thứ", "Sharpe | %/năm | sụt % | 365 ngày %", "Sharpe ≤2024 | ≥2025"], [[WD[k] + (" ◀" if k == 0 else ""), cells(x), shp(x)] for k in range(7) for x in [net_of(D, ls_w(D, sig, D.wd == k))]])
    hx, hexpo = hold(D, W, reb); fa = -(np.vstack([np.zeros((1, S)), W[:-1]]) * F).sum(1); Rc = D.R; var = [("cơ sở", net), ("như lab chấm lần đầu (không tính phí kéo tỉ trọng)", (g0 - c0 + f0)[ev:])]
    var += [(f"phí × {k}", net_of(D, W, cm=k)) for k in (1.5, 2, 3)] + [(f"khớp trễ {k} ngày", net_of(D, lag(D, W, k))) for k in (1, 2)]
    var += [(f"GIỮ NGUYÊN cả tuần, không kéo tỉ trọng (vị thế gộp TB {hexpo.mean() * 100:.0f}%, max {hexpo.max() * 100:.0f}%)", hx), ("không tính funding", net_of(D, W, fund=0.0)),
            ("funding lúc 00:00 tính cho danh mục hôm trước (ước lượng)", (g - c + f + (fa - f) / 3)[ev:])]
    D.R = np.clip(Rc, -0.3, 0.3); var.append(("cắt mọi biến động ngày của 1 mã về ±30%", net_of(D, W))); D.R = Rc
    P("Phí, độ trễ, cách giữ:")
    tbl(["biến thể", "Sharpe | %/năm | sụt % | 365 ngày %", "Sharpe ≤2024 | ≥2025"], [[nm, cells(x), shp(x)] for nm, x in var])

    # ---------- 3. độ tập trung
    P("## 3. Độ tập trung")
    tot = N.sum() or 1e-12; cs = N.sum(0); o = np.argsort(-cs); nl = (W[ev:] > 0).sum(0); ns = (W[ev:] < 0).sum(0); pos = cs[cs > 0].sum() or 1e-12
    P(f"Tổng lời ròng (cộng ngày) {tot * 100:+.0f} điểm % · {int(held.sum())} mã từng giữ · 5 mã tốt nhất = {cs[o[:5]].sum() / tot * 100:.0f}% tổng lời · 15 mã tốt nhất = {cs[o[:15]].sum() / tot * 100:.0f}% · "
      f"tổng các mã lời {pos * 100:+.0f} / các mã lỗ {cs[cs < 0].sum() * 100:+.0f}")
    tbl(["mã", "bên giữ nhiều nhất", "ngày L / S", "đóng góp (điểm %)", "% tổng lời", "trong đó funding"],
        [[D.syms[j], "Long" if nl[j] >= ns[j] else "Short", f"{nl[j]} / {ns[j]}", f"{cs[j] * 100:+.1f}", f"{cs[j] / tot * 100:+.0f}%", f"{Fm[ev:, j].sum() * 100:+.1f}"] for j in o[:15]])
    P("5 mã lỗ nhất: " + " · ".join(f"{D.syms[j]} {cs[j] * 100:+.1f} ({'L' if nl[j] >= ns[j] else 'S'})" for j in o[::-1][:5]) + "\n")
    def drv(i):
        t = np.argsort(-np.abs(N[i]))[:3]; return " · ".join(f"{D.syms[j].replace('USDT', '')}({'L' if W[ev + i, j] > 0 else 'S'}) {N[i, j] * 100:+.1f} [giá {R[ev + i, j] * 100:+.0f}%]" for j in t)
    od = np.argsort(-net)
    for nm, idx in (("10 ngày TỐT nhất", od[:10]), ("10 ngày XẤU nhất", od[::-1][:10])):
        P(f"{nm} (tổng {net[idx].sum() * 100:+.0f} điểm %):"); tbl(["ngày", "ròng %", "thị trường %", "mã chi phối"], [[dates[i].date(), f"{net[i] * 100:+.1f}", f"{mkt[i] * 100:+.1f}", drv(i)] for i in idx])
    b5 = o[:5]; Wz = W.copy(); Wz[:, b5] = 0; sx = sig.copy(); sx[:, b5] = np.nan; rows = [["cơ sở", cells(net), shp(net)]]
    rows.append([f"bỏ 5 mã tốt nhất ({' '.join(D.syms[j].replace('USDT', '') for j in b5)}) – xoá vị thế, giữ nguyên phần còn lại", cells(net_of(D, Wz)), shp(net_of(D, Wz))])
    x = net_of(D, ls_w(D, sx, reb)); rows.append(["bỏ 5 mã đó khỏi rổ chọn rồi xếp hạng lại", cells(x), shp(x)])
    d1 = ~(ex & (W != 0)).any(1)[ev:]; d2 = ~(ex & inU).any(1)[ev:]
    rows.append([f"bỏ {int((~d1).sum())} ngày có mã ĐANG GIỮ chạy > ±60%", cells(net[d1]), "– | –"]); rows.append([f"bỏ {int((~d2).sum())} ngày có mã trong 40 mã lớn chạy > ±60%", cells(net[d2]), "– | –"])
    k5 = np.sort(net)[:-5]; k20 = np.sort(net)[:-20]; rows.append(["bỏ 5 / 20 ngày tốt nhất", f"– | {k5.mean() * 36500:+.0f} / {k20.mean() * 36500:+.0f} | – | –", "– | –"])
    tbl(["thử", "Sharpe | %/năm | sụt % | 365 ngày %", "Sharpe ≤2024 | ≥2025"], rows)
    evs = np.argwhere((ex & (W != 0))[ev:]); evs = sorted(evs, key=lambda e: -abs(N[e[0], e[1]]))[:15]
    if evs:
        P("Các lần mã đang giữ chạy > ±60%/ngày (nghi lỗi dữ liệu / đổi mệnh giá nếu không phải bơm-xả thật):")
        tbl(["ngày", "mã", "bên", "giá %", "đóng góp (điểm %)"], [[dates[i].date(), D.syms[j], "L" if W[ev + i, j] > 0 else "S", f"{R[ev + i, j] * 100:+.0f}", f"{N[i, j] * 100:+.1f}"] for i, j in evs])

    up = ((R > 0.6) & np.isfinite(D.O))[ev:]; dn = ((R < -0.6) & np.isfinite(D.O))[ev:]; hl = W[ev:] > 0; hs = W[ev:] < 0
    P(f"Cân đối may rủi: mã TĂNG > 60%/ngày rơi vào bên Long {int((up & hl).sum())} lần ({(N * (up & hl)).sum() * 100:+.0f} điểm) · bên Short {int((up & hs).sum())} lần ({(N * (up & hs)).sum() * 100:+.0f} điểm); "
      f"mã GIẢM > 60%/ngày: bên Long {int((dn & hl).sum())} lần ({(N * (dn & hl)).sum() * 100:+.0f} điểm) · bên Short {int((dn & hs).sum())} lần ({(N * (dn & hs)).sum() * 100:+.0f} điểm). "
      f"1 mã bên Short tăng +1.600% trong 1 ngày = mất 100% vốn (mỗi mã {0.5 / 8 * 100:.2f}% vốn).\n")

    # ---------- 4. độ bền theo thời gian
    P("## 4. Độ bền theo thời gian")
    s = pd.Series(net, index=dates); qk = [f"{y}Q{q}" for y, q in zip(dates.year, dates.quarter)]; qs = sorted(set(qk)); qa = np.array(qk)
    nL = ((G - Cm + Fm) * (sgc > 0)).sum(1)[ev:]; nS = ((G - Cm + Fm) * (sgc < 0)).sum(1)[ev:]; rows = []; npos = 0
    for q in qs:
        m = qa == q; r = float((1 + net[m]).prod() - 1) * 100; npos += r > 0
        rows.append([q, f"{r:+.1f}", f"{nL[m].sum() * 100:+.1f}", f"{nS[m].sum() * 100:+.1f}", f"{mkt[m].sum() * 100:+.0f}", f"{btc[m].sum() * 100:+.0f}", f"{st(net[m])['sh']:+.1f}"])
    tbl(["quý", "ròng % (lãi kép)", "chân Long (điểm)", "chân Short (điểm)", "thị trường (cộng %)", "BTC (cộng %)", "Sharpe"], rows)
    rs180 = (s.rolling(180).mean() / s.rolling(180).std() * np.sqrt(365)).dropna().values
    if len(rs180):
        P(f"- {npos}/{len(qs)} quý có lời · Sharpe trượt 180 ngày: thấp nhất {rs180.min():+.2f} · 10% thấp {np.percentile(rs180, 10):+.2f} · trung vị {np.median(rs180):+.2f} · cao nhất {rs180.max():+.2f} · "
          f"{(rs180 < 0).mean() * 100:.0f}% số cửa sổ âm · {(rs180 >= 1).mean() * 100:.0f}% ≥ 1,0")
    eq = np.cumprod(1 + net); pk = np.maximum.accumulate(eq); under = eq < pk; run = mx = 0
    for u in under: run = run + 1 if u else 0; mx = max(mx, run)
    P(f"- Chuỗi dài nhất dưới đỉnh cũ: {mx} ngày · ngày xấu nhất {net.min() * 100:+.1f}% · tuần xấu nhất {s.rolling(7).sum().min() * 100:+.1f}% · tháng xấu nhất {s.rolling(30).sum().min() * 100:+.1f}%\n")

    # ---------- 5. sức chứa
    P("## 5. Sức chứa")
    v30 = v30_of(D); rd = [d for d in range(ev, D.nd) if reb[d] and (W[d] != 0).any()]
    if rd:
        for nm, sgn in (("Long", 1), ("Short", -1)):
            med = np.array([np.nanmedian(v30[d][W[d] * sgn > 0]) for d in rd]); mn = np.array([np.nanmin(v30[d][W[d] * sgn > 0]) for d in rd]); k = np.median([(W[d] * sgn > 0).sum() for d in rd])
            P(f"- Chân {nm}: khối lượng TB 30 ngày của mã đang giữ – trung vị {np.median(med) / 1e6:,.0f} triệu USD/ngày · mã NHỎ nhất: trung vị {np.median(mn) / 1e6:,.0f} triệu, 10% thấp {np.percentile(mn, 10) / 1e6:,.0f} triệu · "
              f"~{k:.0f} mã/bên → vốn tối đa để mỗi lệnh ≤ 1% khối lượng ngày của mã nhỏ nhất (mức 10% thấp): {0.01 * np.percentile(mn, 10) / (0.5 / k) / 1e6:,.1f} triệu USD")
    P("")

    # ---------- 6. bản "cứng"
    P("## 6. Lời có còn không khi bỏ phần may rủi? (chỉ để CHẨN ĐOÁN – không phải phương pháp mới)")
    tf, vs, rr = tradfi(D); tj = np.nonzero(tf)[0]; tj = tj[np.argsort(-np.nansum(np.where(tf, np.nan_to_num(D.Q), 0), 0)[tj])]
    assert np.array_equal(sub(D, np.zeros(S, bool)).rank, D.rank), "sub() lệch lab.finish"
    P(f"- {len(tj)} mã bị coi là KHÔNG phải crypto (khối lượng cuối tuần < 12% cả tuần và biên độ cuối tuần < 45% ngày thường): " + " ".join(f"{D.syms[j].replace('USDT', '')}({vs[j] * 100:.0f}%/{rr[j]:.2f})" for j in tj[:60]))
    inT = (inU & tf)[ev:]; P("- Số mã không-crypto trong 40 mã lớn (trung bình mỗi ngày): " + " · ".join(f"{y}: {inT[yrs == y].sum(1).mean():.1f}" for y in Y)
                              + " | đóng góp của các mã đó vào lời xmom14 (điểm %): " + " · ".join(f"{y}: {N[yrs == y][:, tf].sum() * 100:+.1f}" for y in Y))
    Dc = sub(D, tf); Cc = pd.DataFrame(D.C); vol = (Cc / Cc.shift(1) - 1).rolling(30, min_periods=14).std().shift(1).values; iv = np.where(np.isfinite(vol), 1 / np.maximum(vol, 0.01), 1 / 0.08)
    def tranche(DD, lagk=0, fund=1.0, **kw):
        return np.mean([net_of(DD, lag(DD, ls_w(DD, sig, DD.wd == k, **kw), lagk) if lagk else ls_w(DD, sig, DD.wd == k, **kw), fund=fund) for k in range(7)], 0)
    wk = lambda DD: " / ".join(f"{st(net_of(DD, ls_w(DD, sig, DD.wd == k)))['sh']:+.1f}" for k in range(7))  # noqa: E731
    x7 = tranche(D); xc = net_of(Dc, ls_w(Dc, sig, reb)); xc7 = tranche(Dc); xr = tranche(Dc, iv=iv); rows = [
        ["A. cơ sở (thứ Hai, mọi mã)", cells(net), shp(net)] + ysum(net),
        ["B. cơ sở nhưng chia vốn 7 phần, mỗi phần đổi danh mục 1 thứ (hết may rủi về thứ)", cells(x7), shp(x7)] + ysum(x7),
        ["C. chỉ crypto (bỏ mã không-crypto), thứ Hai", cells(xc), shp(xc)] + ysum(xc),
        ["D. chỉ crypto + 7 phần", cells(xc7), shp(xc7)] + ysum(xc7),
        ["E. D + lệnh nhỏ hơn cho mã giật mạnh (tỉ trọng nghịch biến động 30 ngày)", cells(xr), shp(xr)] + ysum(xr)]
    for nm, x in (("F. E + khớp trễ 1 ngày", tranche(Dc, lagk=1, iv=iv)), ("G. E không tính funding", tranche(Dc, fund=0.0, iv=iv))): rows.append([nm, cells(x), shp(x)] + ysum(x))
    Rc = D.R; D.R = Dc.R = np.clip(Rc, -0.3, 0.3); x = tranche(Dc, iv=iv); rows.append(["H. E + cắt biến động ngày của 1 mã về ±30%", cells(x), shp(x)] + ysum(x)); D.R = Dc.R = Rc
    tbl(["bản", "Sharpe | %/năm | sụt % | 365 ngày %", "Sharpe ≤2024 | ≥2025"] + [f"{y} (cộng %)" for y in Y], rows)
    P(f"- Sharpe theo thứ đổi danh mục T2…CN: mọi mã {wk(D)} · chỉ crypto {wk(Dc)}")
    k20 = np.sort(xr)[:-20]; P(f"- Bản E: ngày xấu nhất {xr.min() * 100:+.1f}% · ngày tốt nhất {xr.max() * 100:+.1f}% · bỏ 20 ngày tốt nhất còn {k20.mean() * 36500:+.0f}%/năm · t = {xr.mean() / (xr.std(ddof=1) or 1e-12) * np.sqrt(len(xr)):.2f}\n")

    oos = dates < np.datetime64("2023-07-01")
    if oos.sum() >= 100:
        P(f"**Ngoài mẫu LÙI ({dates[0].date()} → 2023-06-30, {int(oos.sum())} ngày – giai đoạn phòng thử nghiệm CHƯA từng dùng để chọn xmom14)** – Sharpe | %/năm | sụt % | 365 ngày cuối đoạn %:")
        for nm, x in (("A. cơ sở thứ Hai", net), ("B. 7 phần", x7), ("D. chỉ crypto + 7 phần", xc7), ("E. + nghịch biến động", xr)): P(f"- {nm}: {cells(x[oos])} · theo năm " + " · ".join(f"{y}: {x[oos & (yrs == y)].sum() * 100:+.0f}" for y in Y if (oos & (yrs == y)).any()))
        P(f"- Trong mẫu (từ 2023-07-01): A {cells(net[~oos])} · E {cells(xr[~oos])}\n")
    mk = lambda lb, top, sg_=None: book(Dc, sig_of(D, lb) if sg_ is None else sg_, top=top, iv=iv)  # noqa: E731
    mini(Dc, book(Dc, sig, iv=iv), mk, "bản E (chỉ crypto · 7 phần theo thứ · tỉ trọng nghịch biến động) – ứng viên cho 1 id MỚI, không phải sửa xmom14")
    P("")

    # ---------- 7. mức nhiễu
    P("## 7. So với danh mục chọn NGẪU NHIÊN (cùng rổ 40 mã, cùng lịch thứ Hai, 8 mua / 8 bán)")
    rng = np.random.default_rng(11); pg = []; py = []
    for _ in range(200):
        gr = L.pnl(D, ls_w(D, rng.normal(size=(D.nd, S)), reb), drift=False)[0][ev:]; pg.append(st(gr)["sh"]); py.append(gr.mean() * 36500)
    pg = np.array(pg); py = np.array(py); bg = st(gs)["sh"]
    P(f"- Sharpe GỘP (chưa phí/funding) của 200 danh mục ngẫu nhiên: trung bình {pg.mean():+.2f} · độ lệch chuẩn {pg.std():.2f} · 95% {np.percentile(pg, 95):+.2f} · cao nhất {pg.max():+.2f}; lời gộp %/năm: TB {py.mean():+.0f}, 95% {np.percentile(py, 95):+.0f}")
    P(f"- xmom14 gộp: Sharpe {bg:+.2f}, {gs.mean() * 36500:+.0f}%/năm → cao hơn {(pg < bg).mean() * 100:.0f}% danh mục ngẫu nhiên (z = {(bg - pg.mean()) / (pg.std() or 1e-12):+.1f})")
    P(f"- t của lời ròng {net.mean() / (net.std(ddof=1) or 1e-12) * np.sqrt(len(net)):.2f} trên {len(net)} ngày; phòng thử nghiệm đã thử 6 phương pháp (và hơn 20 vòng nghiên cứu trước) → mức ý nghĩa thật thấp hơn con số này.")


if __name__ == "__main__":
    D = load()
    P(f"dữ liệu: {D.nd} ngày × {D.S} mã · {D.dates[0].date()} → {D.dates[-1].date()} · funding tới {D.dates[max(D.fund_until, 0)].date()}")
    report(D)
