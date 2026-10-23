"""Vùng "nam châm" theo SMC – giá có hay quay về / quét các vùng này không, và khả năng bao nhiêu (học máy trên dữ liệu lớn).

Người chơi SMC hay nói: "giá sẽ quay về lấp FVG", "giá sẽ về test Order Block", "giá sẽ đi quét thanh khoản ở các đỉnh bằng nhau",
"giá sẽ về vùng cân bằng 50%". Mô-đun này biến các câu đó thành con số kiểm chứng được:

  1. Ở mỗi thời điểm trong quá khứ (mọi coin, khung 1h / 4h / ngày), liệt kê đúng những vùng mà người xem biểu đồ lúc đó nhìn thấy
     (KHÔNG nhìn trước): FVG chưa lấp, OB chưa chạm, thanh khoản đỉnh/đáy bằng nhau chưa bị quét, đỉnh/đáy swing chưa bị phá,
     mức cân bằng 50% của biên swing – cộng thêm 2 MỨC GIÁ NGẪU NHIÊN (đối chứng) cùng khoảng cách.
  2. Ghi lại đặc trưng (khoảng cách theo ATR, độ dày vùng, tuổi, chiều cấu trúc, premium/discount, đà giá, biến động…)
     và nhãn: giá có chạm mép gần của vùng trong H nến tới không (1h: 48 nến ≈ 2 ngày, 4h: 30 nến ≈ 5 ngày, ngày: 10 nến).
  3. Học máy (gradient boosting) ước xác suất chạm; so với mô hình chỉ biết khoảng cách và so với mức giá ngẫu nhiên → biết
     vùng SMC có thật sự "hút" giá hơn một mức giá bất kỳ hay không (độ hút = lift).
  4. Cây quyết định được xuất ra JSON để trình duyệt chấm điểm TRỰC TIẾP trên mọi khung đang xem (giá từng giây).

Quy tắc nhận diện giống hệt TA.smc() trong site/app.js (sửa một bên phải sửa bên kia).
Bộ nhớ: data/magnet/dataset.parquet (cộng dồn mỗi tuần, nến 1h chỉ giữ ~60 ngày nên cộng dồn mới thành dữ liệu lớn).
"""
from __future__ import annotations

import json
import logging
import math
import zlib
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd

from ..data import store

log = logging.getLogger(__name__)

H = {"h1": 48, "h4": 30, "d": 10}                 # số nến nhìn tới
STRIDE = {"h1": 4, "h4": 3, "d": 2}               # lấy mẫu mỗi bao nhiêu nến
TFI = {"h1": 0, "h4": 1, "d": 2}
KINDS = ["fvg", "ob", "liq", "swing", "eq", "rand"]
FEATS = ["kind", "above", "dist", "size", "age", "align", "fresh", "touch", "pd", "mom", "atrp", "rank", "tf"]
RETRAIN_DAYS = 7
MAX_ROWS = 4_000_000
BANDS = [0, 0.5, 1, 2, 3, 5, 8, 12]


def _path(name: str):
    p = store.path("magnet")
    p.mkdir(parents=True, exist_ok=True)
    return p / name


# ---------------------------------------------------------------- nhận diện (giống TA.smc trên web)
def _atr(h, l, c, n=14):
    out = np.empty(len(c))
    a = None
    for i in range(len(c)):
        tr = h[i] - l[i] if i == 0 else max(h[i] - l[i], abs(h[i] - c[i - 1]), abs(l[i] - c[i - 1]))
        a = tr if a is None else (a * (n - 1) + tr) / n
        out[i] = a
    return out


def _fractals(h, l, n=3):
    hs, ls = [], []
    for i in range(n, len(h) - n):
        wh, wl = h[i - n:i + n + 1], l[i - n:i + n + 1]
        if h[i] >= wh.max() and h[i] > h[i - 1]:
            hs.append((i, float(h[i]), i + n))
        if l[i] <= wl.min() and l[i] < l[i - 1]:
            ls.append((i, float(l[i]), i + n))
    return hs, ls


def scan(o, h, l, c, n=3):
    """Một lượt qua toàn bộ chuỗi: trạng thái SMC tại TỪNG nến (chỉ dùng dữ liệu tới nến đó)."""
    N = len(c)
    atr = _atr(h, l, c)
    hs, ls = _fractals(h, l, n)
    ih = il = 0
    sh = sl = None
    trend = 0
    obs = []
    tr_a = np.zeros(N, dtype=np.int8)
    shp, shi, slp, sli = np.full(N, np.nan), np.full(N, -1), np.full(N, np.nan), np.full(N, -1)
    nh, nl = np.zeros(N, dtype=np.int32), np.zeros(N, dtype=np.int32)          # số fractal đã xác nhận tới nến i
    for i in range(N):
        while ih < len(hs) and hs[ih][2] <= i:
            sh = {"i": hs[ih][0], "p": hs[ih][1], "br": False}
            ih += 1
        while il < len(ls) and ls[il][2] <= i:
            sl = {"i": ls[il][0], "p": ls[il][1], "br": False}
            il += 1
        if sh and not sh["br"] and c[i] > sh["p"]:
            sh["br"] = True
            trend = 1
            for j in range(i - 1, max(sl["i"] if sl else 0, i - 15) - 1, -1):
                if c[j] < o[j]:
                    obs.append({"i": j, "lo": float(l[j]), "hi": float(h[j]), "dir": 1, "born": i, "mit": None, "dead": None})
                    break
        if sl and not sl["br"] and c[i] < sl["p"]:
            sl["br"] = True
            trend = -1
            for j in range(i - 1, max(sh["i"] if sh else 0, i - 15) - 1, -1):
                if c[j] > o[j]:
                    obs.append({"i": j, "lo": float(l[j]), "hi": float(h[j]), "dir": -1, "born": i, "mit": None, "dead": None})
                    break
        for b in obs:
            if b["dead"] is not None or i <= b["born"]:
                continue
            if b["dir"] == 1:
                if b["mit"] is None and l[i] <= b["hi"]:
                    b["mit"] = i
                if c[i] < b["lo"]:
                    b["dead"] = i
            else:
                if b["mit"] is None and h[i] >= b["lo"]:
                    b["mit"] = i
                if c[i] > b["hi"]:
                    b["dead"] = i
        tr_a[i] = trend
        if sh and not sh["br"]:
            shp[i], shi[i] = sh["p"], sh["i"]
        if sl and not sl["br"]:
            slp[i], sli[i] = sl["p"], sl["i"]
        nh[i], nl[i] = ih, il
    # FVG: tạo ở nến k (nến thứ 3), lấp khi giá đi xuyên hết
    fv = []
    for k in range(2, N):
        if l[k] > h[k - 2] and l[k] - h[k - 2] >= 0.25 * atr[k]:
            lo, hi, fill = float(h[k - 2]), float(l[k]), None
            idx = np.nonzero(l[k + 1:] <= lo)[0]
            fill = int(k + 1 + idx[0]) if len(idx) else None
            fv.append((k, lo, hi, 1, fill))
        if h[k] < l[k - 2] and l[k - 2] - h[k] >= 0.25 * atr[k]:
            lo, hi = float(h[k]), float(l[k - 2])
            idx = np.nonzero(h[k + 1:] >= hi)[0]
            fill = int(k + 1 + idx[0]) if len(idx) else None
            fv.append((k, lo, hi, -1, fill))
    return {"atr": atr, "hs": hs, "ls": ls, "obs": obs, "fvg": fv, "trend": tr_a, "shp": shp, "shi": shi, "slp": slp, "sli": sli, "nh": nh, "nl": nl}


def _liq(arr, cnt, i, a, hi_or_lo, sg):
    """Đỉnh/đáy bằng nhau chưa bị quét tới nến i (12 fractal gần nhất, sai lệch ≤ 0,15 ATR)."""
    P = arr[max(0, cnt - 12):cnt]
    used, out = set(), []
    for x in range(len(P)):
        if x in used:
            continue
        g = [P[x]]
        for y in range(x + 1, len(P)):
            if y not in used and abs(P[y][1] - P[x][1]) <= 0.15 * a:
                g.append(P[y])
                used.add(y)
        if len(g) >= 2:
            lvl = max(q[1] for q in g) if sg == 1 else min(q[1] for q in g)
            li = max(q[0] for q in g)
            seg = hi_or_lo[li + 1:i + 1]
            sw = bool(len(seg) and ((seg.max() > lvl) if sg == 1 else (seg.min() < lvl)))
            if not sw:
                out.append((lvl, len(g), li))
    return out


def zones_at(S, o, h, l, c, i, tf, rng=None):
    """Các vùng nhìn thấy tại nến i + đặc trưng. Trả về list dict (kind, lo, hi, edge, above, ...)."""
    a = S["atr"][i]
    p = c[i]
    if not a or a <= 0 or not p:
        return []
    Z = []

    def put(kind, lo, hi, born, dr=0, touch=0):
        if hi < p:
            above, edge = 0, hi
        elif lo > p:
            above, edge = 1, lo
        else:
            return
        dist = abs(edge - p) / a
        if dist <= 0.02 or dist > 12:
            return
        fresh = 1 if (dr == 1 and not above) or (dr == -1 and above) else 0
        Z.append({"kind": kind, "lo": lo, "hi": hi, "edge": edge, "above": above, "dist": dist, "size": (hi - lo) / a,
                  "age": math.log1p(max(0, i - born)) if born is not None else 0.0, "fresh": fresh, "touch": touch, "dir": dr, "born": born})

    for (k, lo, hi, dr, fill) in S["fvg"]:
        if k > i or k < i - 149 or (fill is not None and fill <= i):
            continue
        put(0, lo, hi, k - 1, dr)
    for b in S["obs"]:
        if b["born"] > i or (b["dead"] is not None and b["dead"] <= i) or (b["mit"] is not None and b["mit"] <= i):
            continue
        put(1, b["lo"], b["hi"], b["i"], b["dir"])
    nh, nl = int(S["nh"][i]), int(S["nl"][i])
    for lvl, nn, li in _liq(S["hs"], nh, i, a, h, 1):
        put(2, lvl, lvl, li, -1, nn)
    for lvl, nn, li in _liq(S["ls"], nl, i, a, l, -1):
        put(2, lvl, lvl, li, 1, nn)
    if not math.isnan(S["shp"][i]):
        put(3, S["shp"][i], S["shp"][i], int(S["shi"][i]), -1)
    if not math.isnan(S["slp"][i]):
        put(3, S["slp"][i], S["slp"][i], int(S["sli"][i]), 1)
    pd_pos = 50.0
    if nh and nl:
        hiR = max(q[1] for q in S["hs"][max(0, nh - 3):nh])
        loR = min(q[1] for q in S["ls"][max(0, nl - 3):nl])
        if hiR > loR:
            pd_pos = float(np.clip((p - loR) / (hiR - loR) * 100, -50, 150))
            eq = (hiR + loR) / 2
            put(4, eq, eq, None, 0)
    # thứ tự gần → xa trên mỗi phía (vùng thật)
    for side in (0, 1):
        zs = sorted([z for z in Z if z["above"] == side], key=lambda z: z["dist"])
        for r_, z in enumerate(zs, 1):
            z["rank"] = r_
    if rng is not None:        # đối chứng: 2 mức giá ngẫu nhiên cùng dải khoảng cách
        for side in (0, 1):
            d = float(rng.uniform(0.3, 6.0))
            e = p + d * a if side else p - d * a
            if e > 0:
                Z.append({"kind": 5, "lo": e, "hi": e, "edge": e, "above": side, "dist": d, "size": 0.0, "age": 0.0, "fresh": 0, "touch": 0, "dir": 0, "born": None, "rank": 0})
    tr = int(S["trend"][i])
    mom = (p - c[max(0, i - 10)]) / a
    for z in Z:
        z["align"] = tr * (1 if z["above"] else -1)
        z["pd"] = pd_pos
        z["mom"] = float(mom)
        z["atrp"] = float(a / p * 100)
        z["tf"] = TFI[tf]
    return Z


# ---------------------------------------------------------------- thu thập dữ liệu học
def collect(key: str, tf: str, df: pd.DataFrame, seed: int = 0) -> pd.DataFrame:
    d = df.reset_index(drop=True)
    N, Hh = len(d), H[tf]
    if N < 200 + Hh:
        return pd.DataFrame()
    o, h, l, c = (d[k].values.astype(float) for k in ("open", "high", "low", "close"))
    t = pd.to_datetime(d["date"]).values.astype("datetime64[s]").astype("int64")
    S = scan(o, h, l, c)
    rng = np.random.default_rng(zlib.crc32(f"{key}|{tf}|{seed}".encode()))
    rows = []
    for i in range(150, N - Hh - 1, STRIDE[tf]):
        Z = zones_at(S, o, h, l, c, i, tf, rng)
        if not Z:
            continue
        fh, fl = h[i + 1:i + Hh + 1], l[i + 1:i + Hh + 1]
        for z in Z:
            if z["above"]:
                hit = np.nonzero(fh >= z["edge"])[0]
            else:
                hit = np.nonzero(fl <= z["edge"])[0]
            y = 1 if len(hit) else 0
            rx = -1
            if y:                 # phản ứng sau khi chạm: bật ngược ≥ 1 ATR (1) hay đi xuyên ≥ 1 ATR (0) trước, trong H nến sau khi chạm
                j0 = i + 1 + int(hit[0]); e, a_ = z["edge"], S["atr"][i]
                far = e + a_ if z["above"] else e - a_          # đi tiếp cùng chiều (xuyên vùng)
                back = e - a_ if z["above"] else e + a_         # quay đầu
                if (h[j0] >= far) if z["above"] else (l[j0] <= far):
                    rx = 0
                else:
                    for j in range(j0 + 1, min(N, j0 + 1 + Hh)):
                        if (l[j] <= back) if z["above"] else (h[j] >= back):
                            rx = 1
                            break
                        if (h[j] >= far) if z["above"] else (l[j] <= far):
                            rx = 0
                            break
            rows.append((key, TFI[tf], int(t[i]), z["kind"], z["above"], z["dist"], z["size"], z["age"], z["align"], z["fresh"], z["touch"],
                         z["pd"], z["mom"], z["atrp"], z["rank"], y, int(hit[0]) + 1 if y else -1, rx))
    if not rows:
        return pd.DataFrame()
    X = pd.DataFrame(rows, columns=["key", "tf", "t", "kind", "above", "dist", "size", "age", "align", "fresh", "touch", "pd", "mom", "atrp", "rank", "y", "bars", "rx"])
    for col in ("dist", "size", "age", "pd", "mom", "atrp"):
        X[col] = X[col].astype("float32")
    for col in ("tf", "kind", "above", "align", "fresh", "touch", "rank", "y", "rx"):
        X[col] = X[col].astype("int8")
    X["bars"] = X["bars"].astype("int16")
    return X


# ---------------------------------------------------------------- học + xuất mô hình cho trình duyệt
def _export(model) -> dict:
    trees = []
    for it in model._predictors:
        nd = it[0].nodes
        trees.append({"f": nd["feature_idx"].astype(int).tolist(), "t": [float(x) for x in nd["num_threshold"]],
                      "l": nd["left"].astype(int).tolist(), "r": nd["right"].astype(int).tolist(),
                      "v": [round(float(x), 6) for x in nd["value"]], "z": nd["is_leaf"].astype(int).tolist(),
                      "m": nd["missing_go_to_left"].astype(int).tolist()})
    return {"base": float(np.ravel(model._baseline_prediction)[0]), "feats": FEATS, "trees": trees}


def _raw(E: dict, x: np.ndarray) -> float:
    s = E["base"]
    for T in E["trees"]:
        k = 0
        while not T["z"][k]:
            v = x[T["f"][k]]
            k = T["l"][k] if (v <= T["t"][k] if not math.isnan(v) else T["m"][k]) else T["r"][k]
        s += T["v"][k]
    return s


class Memory:
    def __init__(self):
        self.parts: list[pd.DataFrame] = []
        prev = _path("summary.json")
        self.prev = json.loads(prev.read_text(encoding="utf-8")) if prev.exists() else {}
        self.due = not self.prev.get("trained_at") or datetime.now(timezone.utc) - datetime.fromisoformat(self.prev["trained_at"]) >= timedelta(days=RETRAIN_DAYS)

    def add(self, key: str, tf: str, df: pd.DataFrame):
        if not self.due or df is None or tf not in H:
            return
        try:
            x = collect(key, tf, df)
            if not x.empty:
                self.parts.append(x)
        except Exception as e:  # noqa: BLE001
            log.debug("magnet %s %s: %s", key, tf, e)

    def dataset(self) -> pd.DataFrame:
        p = _path("dataset.parquet")
        new = pd.concat(self.parts, ignore_index=True) if self.parts else pd.DataFrame()
        if p.exists():
            try:
                old = pd.read_parquet(p)
                new = pd.concat([old, new], ignore_index=True) if not new.empty else old
            except Exception as e:  # noqa: BLE001
                log.warning("magnet: đọc bộ nhớ lỗi %s", e)
        if new.empty:
            return new
        new = new.drop_duplicates(["key", "tf", "t", "kind", "above", "dist"], keep="last")
        if len(new) > MAX_ROWS:
            new = new.sort_values("t").tail(MAX_ROWS)
        new.reset_index(drop=True).to_parquet(p, index=False)
        return new

    def finish(self, force: bool = False) -> dict:
        if not (self.due or force):
            return self.prev
        D = self.dataset()
        if len(D) < 20000:
            out = {**self.prev, "why": f"mới {len(D)} quan sát – cần ≥ 20.000"}
            return out
        out = train(D)
        _path("summary.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
        return out


def train(D: pd.DataFrame) -> dict:
    from sklearn.ensemble import HistGradientBoostingClassifier
    from sklearn.metrics import brier_score_loss, roc_auc_score

    D = D[(D["dist"] > 0) & (D["dist"] <= 12)].copy()
    cut = D["t"].quantile(0.8)
    tr, te = D[D["t"] <= cut], D[D["t"] > cut]
    if len(tr) > 2_500_000:
        tr = tr.sample(2_500_000, random_state=1)
    X, Xt = tr[FEATS].to_numpy(np.float32), te[FEATS].to_numpy(np.float32)
    y, yt = tr["y"].to_numpy(), te["y"].to_numpy()
    prm = dict(max_iter=220, learning_rate=0.08, max_leaf_nodes=15, min_samples_leaf=200, l2_regularization=1.0, early_stopping=False, random_state=1)
    m = HistGradientBoostingClassifier(**prm).fit(X, y)
    BASE = ["dist", "above", "tf", "atrp"]
    mb = HistGradientBoostingClassifier(**{**prm, "max_iter": 120}).fit(tr[BASE].to_numpy(np.float32), y)
    pt, pb = m.predict_proba(Xt)[:, 1], mb.predict_proba(te[BASE].to_numpy(np.float32))[:, 1]
    res = {"n": int(len(D)), "n_train": int(len(tr)), "n_test": int(len(te)), "keys": int(D["key"].nunique()),
           "auc": round(float(roc_auc_score(yt, pt)), 4), "auc_base": round(float(roc_auc_score(yt, pb)), 4),
           "brier": round(float(brier_score_loss(yt, pt)), 4), "brier_base": round(float(brier_score_loss(yt, pb)), 4),
           "rate": round(float(yt.mean()), 4), "test_from": datetime.fromtimestamp(int(cut), timezone.utc).strftime("%Y-%m-%d")}
    # độ tin cậy của xác suất (chia 10 nhóm)
    q = pd.DataFrame({"p": pt, "y": yt})
    q["b"] = np.clip((q["p"] * 10).astype(int), 0, 9)
    res["calib"] = [[round(float(g["p"].mean()), 3), round(float(g["y"].mean()), 3), int(len(g))] for _, g in q.groupby("b")]
    # LỰC HÚT THẬT: vùng SMC có được chạm nhiều hơn một mức giá NGẪU NHIÊN có cùng khoảng cách / biến động / khung không?
    # mô hình chỉ học trên mức giá ngẫu nhiên → kỳ vọng cho từng vùng → lift = tỷ lệ chạm thật ÷ kỳ vọng (dữ liệu kiểm tra)
    CB = ["dist", "above", "tf", "atrp", "mom"]
    ctl_tr = tr[tr["kind"] == 5]
    mc = HistGradientBoostingClassifier(**{**prm, "max_iter": 150}).fit(ctl_tr[CB].to_numpy(np.float32), ctl_tr["y"].to_numpy())
    Z = te[te["kind"] < 5].copy()
    Z["exp"] = mc.predict_proba(Z[CB].to_numpy(np.float32))[:, 1]
    lift = {}
    for k in range(5):
        g = Z[Z["kind"] == k]
        if len(g) < 500:
            continue
        lift[KINDS[k]] = {"n": int(len(g)), "rate": round(float(g["y"].mean()), 3), "ctl": round(float(g["exp"].mean()), 3),
                          "lift": round(float(g["y"].mean() / max(1e-6, g["exp"].mean())), 3),
                          "tf": {str(t_): round(float(x["y"].mean() / max(1e-6, x["exp"].mean())), 3) for t_, x in g.groupby("tf") if len(x) >= 300}}
    res["lift"] = lift
    # PHẢN ỨNG sau khi chạm: bật ngược ≥ 1 ATR trước hay xuyên qua ≥ 1 ATR trước – so với mức giá ngẫu nhiên cùng khung (toàn bộ dữ liệu)
    T = D[(D["y"] == 1) & (D["rx"] >= 0)] if "rx" in D.columns else D.iloc[0:0]
    react = {}
    for k in range(6):
        g = T[T["kind"] == k]
        if len(g) < 500:
            continue
        per = {}
        for t_, x in g.groupby("tf"):
            c_ = T[(T["kind"] == 5) & (T["tf"] == t_)]["rx"]
            if len(x) >= 300 and len(c_) >= 300:
                per[str(t_)] = [round(float(x["rx"].mean()), 3), round(float(c_.mean()), 3), int(len(x))]
        react[KINDS[k]] = {"n": int(len(g)), "bounce": round(float(g["rx"].mean()), 3), "tf": per}
    res["react"] = react
    # theo dải khoảng cách: tỷ lệ chạm & số nến trung vị (dùng để ước thời gian)
    eta = {}
    for tfi in (0, 1, 2):
        g = D[(D["tf"] == tfi) & (D["kind"] < 5)]
        rows = []
        for b0, b1 in zip(BANDS[:-1], BANDS[1:]):
            x = g[(g["dist"] > b0) & (g["dist"] <= b1)]
            if len(x) < 200:
                continue
            hit = x[x["y"] == 1]
            rows.append([b0, b1, round(float(x["y"].mean()), 3), int(hit["bars"].median()) if len(hit) else None, int(len(x))])
        eta[str(tfi)] = rows
    res["eta"] = eta
    # mô hình dựa vào gì (độ quan trọng hoán vị trên mẫu nhỏ)
    try:
        from sklearn.inspection import permutation_importance
        s_ = te.sample(min(30000, len(te)), random_state=2)
        pi = permutation_importance(m, s_[FEATS].to_numpy(np.float32), s_["y"].to_numpy(), n_repeats=3, random_state=3, scoring="roc_auc")
        res["importance"] = {f: round(float(v), 4) for f, v in sorted(zip(FEATS, pi.importances_mean), key=lambda z: -z[1])}
    except Exception as e:  # noqa: BLE001
        log.debug("magnet importance: %s", e)
    res["ok"] = bool(res["auc"] > res["auc_base"] + 0.005)
    # học lại trên toàn bộ rồi xuất cây cho trình duyệt
    allX = D if len(D) <= 2_500_000 else D.sample(2_500_000, random_state=4)
    mf = HistGradientBoostingClassifier(**prm).fit(allX[FEATS].to_numpy(np.float32), allX["y"].to_numpy())
    E_ = _export(mf)
    x0 = allX[FEATS].to_numpy(np.float64)[:200]
    chk = np.abs(1 / (1 + np.exp(-np.array([_raw(E_, r) for r in x0]))) - mf.predict_proba(x0.astype(np.float32))[:, 1]).max()
    res["export_err"] = round(float(chk), 6)
    res["H"] = H
    res["trained_at"] = datetime.now(timezone.utc).isoformat()
    _path("model.json").write_text(json.dumps(E_, separators=(",", ":")), encoding="utf-8")
    return res


def site_payload(S: dict) -> dict:
    """Tóm tắt + cây quyết định cho web (data/magnet.json)."""
    out = {k: S.get(k) for k in ("n", "n_train", "n_test", "keys", "auc", "auc_base", "brier", "brier_base", "rate", "test_from", "calib", "lift", "react", "eta",
                                  "importance", "ok", "H", "trained_at", "why")}
    p = _path("model.json")
    if p.exists():
        out["model"] = json.loads(p.read_text(encoding="utf-8"))
    return out
