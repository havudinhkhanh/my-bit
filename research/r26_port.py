"""Vòng 26 – mô phỏng DANH MỤC theo từng phút trên đường đi lời/lỗ thật của từng chân (research_out/round26.json.gz từ round26.py).
Khác mô phỏng các vòng trước (ghi lời/lỗ ở phút vào + 61): ở đây mỗi chân đóng đúng phút nó đóng, tài sản tính CẢ lời/lỗ đang mở (theo giá cuối mỗi phút),
nên đo được ngày tệ / sụt tối đa thật và thử được luật "đóng hết khi ngày lỗ X%".
Luật thoát từng chân: giữ 60 phút | cắt lỗ đuổi A/G (giá cuối phút, chân mua ngay không đuổi) | cắt lỗ thảm hoạ −3.500 (mọi luật).
Luật danh mục: 7,5%/cú (2 chân chờ 3,75% + chân mua ngay 2%), tối đa 9 cú, ngừng mở mới khi tài sản trong ngày (giờ VN) ≤ −3% (như bot),
  + tuỳ chọn KILL = đóng hết mọi chân khi tài sản trong ngày ≤ −K% (tính cả lời/lỗ đang mở) rồi nghỉ tới hết ngày,
  + tuỳ chọn CRASH = khi ≥ N cú sốc (mọi mã, qua lọc) trong 30 phút gần nhất → các chân đang giữ chuyển sang cắt lỗ đuổi 150/100.
Trượt thêm mỗi lần thoát (chân mua ngay: cả lúc vào). Chạy: python research/r26_port.py research_out/round26.json.gz > research/r26_result.md"""
import bisect
import gzip
import json
import sys

import numpy as np

SZ_L, SZ_M, CAP, W, DAY_STOP, CAT = 0.0375, 0.02, 9, 8, 0.03, 3500.0
HALVES = ("2024H1", "2024H2", "2025H1", "2025H2", "2026H1", "2026H2")
CRASH_DAY = "2025-10-11"


def vnday(m):
    return np.datetime_as_string(np.datetime64(int(m + 420), "m"), unit="D")


def load(path):
    J = json.load(gzip.open(path, "rt"))
    sh = {int(k): v for k, v in J["sh"].items()}
    tr = {int(k): v for k, v in J["tr"].items()}
    return sh, tr, J["days"]


def sim(sh, tr, days, mode="hold", A=150, G=100, kill=None, crash=None, slip=10.0, skip_day=None):
    allT = sorted(v["T"] for v in sh.values())
    order = sorted((k for k in tr if any(D in tr[k] for D in ("1.25", "1.5", "0.0"))), key=lambda k: (sh[k]["T"], min(L["tf"] for L in tr[k].values())))
    eq = 1.0                  # tài sản đã chốt
    op = []                   # chân đang mở
    shocks_open = {}          # k → số chân còn mở
    dayp = {}; cur_day = None; day0 = 1.0; paused = False; kills = 0; peak = 1.0; dd = 0.0; n_ent = 0

    def mtm():
        return eq + sum(L["usd"] * L["now"] / 1e4 for L in op)

    def close(L, net):
        nonlocal eq
        eq += L["usd"] * (net - slip * (2 if L["mk"] else 1)) / 1e4
        shocks_open[L["k"]] -= 1
        if shocks_open[L["k"]] <= 0:
            del shocks_open[L["k"]]

    def crash_on(m):
        if not crash:
            return False
        i = bisect.bisect_right(allT, m); j = bisect.bisect_left(allT, m - 30)
        return i - j >= crash

    def step(m):
        """xử lý mọi chân có giá cuối phút m · kiểm luật thoát · cập nhật tài sản / ngày / kill"""
        nonlocal cur_day, day0, paused, kills, peak, dd
        d = vnday(m)
        if d != cur_day:
            if cur_day is not None:
                dayp[cur_day] = mtm() / day0 - 1
            cur_day = d; day0 = mtm(); paused = False
        cr = crash_on(m)
        for L in list(op):
            ts = L["ts"]; i = L["i"]
            while i < len(ts) and ts[i] <= m:
                i += 1
            L["i"] = i
            if i == 0:
                continue                        # chưa khớp / chưa có giá cuối phút nào
            pn, ex = L["pn"][i - 1], L["ex"][i - 1]; L["now"] = ex - slip * (2 if L["mk"] else 1)
            L["cm"] = max(L["cm"], pn)
            if L["cat"] is not None and L["cat"] <= m:
                op.remove(L); close(L, min(ex, -CAT - 10)); continue
            use_tr = (mode == "trail" or (cr and mode == "hold")) and not L["mk"]
            a, g = (A, G) if mode == "trail" else (150, 100)
            if use_tr and L["cm"] >= a and pn <= L["cm"] - g:
                op.remove(L); close(L, ex); continue
            if m >= L["tend"]:
                op.remove(L); close(L, L["end"]); continue
        v = mtm(); peak = max(peak, v); dd = max(dd, 1 - v / peak)
        if not paused and v / day0 - 1 <= -DAY_STOP:
            paused = True
        if kill and op and v / day0 - 1 <= -kill:
            for L in list(op):
                op.remove(L); close(L, L["now"] + slip * (2 if L["mk"] else 1))
            kills += 1; paused = True

    def advance(to):
        """chạy từng phút có giá của các chân đang mở, tới trước phút `to`"""
        while op:
            nxt = min((L["ts"][L["i"]] if L["i"] < len(L["ts"]) else L["tend"]) for L in op)
            nxt = min(nxt, min(L["tend"] for L in op))
            if nxt >= to:
                break
            step(nxt)

    for k in order:
        s = sh[k]; T = s["T"]
        if skip_day and s["d"] == skip_day:
            continue
        advance(T)
        d = vnday(T)
        if d != cur_day:
            step(T)
        if paused or len(shocks_open) >= CAP:
            continue
        legs = [(D, tr[k][D]) for D in ("1.25", "1.5") if D in tr[k] and tr[k][D]["f"] <= W]
        if s["side"] > 0 and s["r15"] <= -300 and "0.0" in tr[k]:
            legs.append(("0.0", tr[k]["0.0"]))
        if not legs:
            continue
        base = mtm(); n_ent += 1; shocks_open[k] = len(legs)
        for D, L in legs:
            tf_m = L["tf"] // 60000
            op.append(dict(k=k, usd=(SZ_M if D == "0.0" else SZ_L) * base, mk=L["mk"], ts=L["ts"], pn=L["pn"], ex=L["ex"], end=L["end"], cat=L["cat"],
                           tend=tf_m + 60, i=0, cm=-1e9, now=0.0))
    advance(10 ** 12)
    if cur_day is not None:
        dayp[cur_day] = mtm() / day0 - 1
    dr = np.array([dayp.get(d, 0.0) for d in days if d != skip_day])
    hv = {}
    for d, r in dayp.items():
        h = f"{d[:4]}{'H1' if int(d[5:7]) <= 6 else 'H2'}"; hv[h] = hv.get(h, 1) * (1 + r)
    sh_ = dr.mean() / dr.std() * np.sqrt(365) if dr.std() > 0 else 0
    yrs = len(dr) / 365; tot = mtm() - 1; ann = (1 + tot) ** (1 / yrs) - 1 if yrs > 0 else 0
    wd = min(dayp, key=dayp.get) if dayp else None
    return dict(tot=tot * 100, dd=dd * 100, wday=dayp[wd] * 100 if wd else 0, wd=wd, sh=sh_, rdd=ann / dd if dd > 0 else 0, kills=kills, n=n_ent,
                halves=[(hv.get(h, 1) - 1) * 100 for h in HALVES], dayp=dayp, crash=dayp.get(CRASH_DAY, 0) * 100)


VARIANTS = [("cắt lỗ đuổi 150/100 (đang chạy)", dict(mode="trail")),
            ("giữ 60 phút", dict(mode="hold")),
            ("giữ 60 + đóng hết khi ngày −3%", dict(mode="hold", kill=0.03)),
            ("giữ 60 + đóng hết khi ngày −5%", dict(mode="hold", kill=0.05)),
            ("giữ 60 + đóng hết khi ngày −8%", dict(mode="hold", kill=0.08)),
            ("cắt lỗ đuổi + đóng hết khi ngày −3%", dict(mode="trail", kill=0.03)),
            ("cắt lỗ đuổi + đóng hết khi ngày −5%", dict(mode="trail", kill=0.05)),
            ("giữ 60, thị trường sập (≥5 cú/30 phút) → đuổi", dict(mode="hold", crash=5)),
            ("giữ 60, thị trường sập (≥10 cú/30 phút) → đuổi", dict(mode="hold", crash=10)),
            ("giữ 60, thị trường sập (≥20 cú/30 phút) → đuổi", dict(mode="hold", crash=20)),
            ("giữ 60, sập ≥10 → đuổi + đóng hết khi ngày −5%", dict(mode="hold", crash=10, kill=0.05)),
            ("giữ 60, sập ≥5 → đuổi + đóng hết khi ngày −3%", dict(mode="hold", crash=5, kill=0.03))]


def main(path):
    sh, tr, days = load(path)
    pr = print
    nleg = sum(len(v) for v in tr.values())
    pr(f"# Vòng 26 – giữ 60 phút có lưới an toàn danh mục · {min(days)} → {max(days)} · đường đi lời/lỗ từng phút theo giao dịch thật\n")
    pr(f"{len(sh)} cú sốc qua lọc · {len(tr)} cú có chân khớp ({nleg} chân). Tài sản tính cả lời/lỗ đang mở (giá cuối mỗi phút); mỗi chân đóng đúng phút nó đóng.\n")
    pr("7,5%/cú, tối đa 9 cú, ngừng mở mới khi ngày ≤ −3% (như bot). \"Đóng hết khi ngày −K%\" = đóng mọi chân bằng lệnh thị trường rồi nghỉ tới hết ngày (giờ VN).\n")
    R = {}
    for sl in (10, 20):
        pr(f"## {'1' if sl == 10 else '2'}. Trượt thêm {sl} bps mỗi lần thoát\n")
        pr("| Luật | Lợi nhuận | Sụt tối đa | Ngày tệ | Ngày 10/10/2025 | Sharpe | Lời năm / sụt | Số lần đóng hết | " + " | ".join(HALVES) + " | Nửa năm âm |\n|---|---|---|---|---|---|---|---|" + "---|" * (len(HALVES) + 1))
        for nm, kw in VARIANTS:
            x = sim(sh, tr, days, slip=sl, **kw); R[(nm, sl)] = x
            pr(f"| {nm} | {x['tot']:+.0f}% | {x['dd']:.1f}% | {x['wday']:.1f}% ({x['wd']}) | {x['crash']:+.1f}% | {x['sh']:.2f} | {x['rdd']:.2f} | {x['kills']} | "
               + " | ".join(f"{v:+.0f}%" for v in x["halves"]) + f" | {sum(v < 0 for v in x['halves'])} |")
        pr("")
    pr("## 3. Bỏ hẳn ngày 10/10/2025 (để không chọn luật chỉ vì một ngày) – trượt 10\n")
    pr("| Luật | Lợi nhuận | Sụt tối đa | Ngày tệ | Sharpe | Lời năm / sụt |\n|---|---|---|---|---|---|")
    for nm, kw in VARIANTS:
        x = sim(sh, tr, days, slip=10, skip_day=CRASH_DAY, **kw)
        pr(f"| {nm} | {x['tot']:+.0f}% | {x['dd']:.1f}% | {x['wday']:.1f}% ({x['wd']}) | {x['sh']:.2f} | {x['rdd']:.2f} |")
    pr("\n## 4. 8 ngày tệ nhất của luật đang chạy và của giữ 60 phút – % tài sản trong ngày (trượt 10)\n")
    names = [nm for nm, _ in VARIANTS]
    dp = {nm: R[(nm, 10)]["dayp"] for nm in names}
    worst = sorted(set(sorted(dp[names[1]], key=dp[names[1]].get)[:6]) | set(sorted(dp[names[0]], key=dp[names[0]].get)[:4]), key=lambda d: dp[names[1]].get(d, 0))
    pr("| Ngày | " + " | ".join(names) + " |\n|---|" + "---|" * len(names))
    for d in worst:
        pr(f"| {d} | " + " | ".join(f"{dp[nm].get(d, 0) * 100:+.1f}%" for nm in names) + " |")
    pr("\n## 5. Tháng gần đây – % tài sản (trượt 10)\n")
    mos = sorted({d[:7] for d in days if d >= "2026-06"})
    pr("| Luật | " + " | ".join(mos) + " |\n|---|" + "---|" * len(mos))
    for nm in names:
        mv = {}
        for d, r in dp[nm].items():
            mv[d[:7]] = mv.get(d[:7], 1) * (1 + r)
        pr(f"| {nm} | " + " | ".join(f"{(mv.get(m, 1) - 1) * 100:+.1f}%" for m in mos) + " |")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "research_out/round26.json.gz")
