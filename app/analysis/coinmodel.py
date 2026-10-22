"""Mô hình học theo TỪNG MÃ – "mỗi mã một cách chơi", lưu vào bộ nhớ và học tiếp mỗi tuần.

Ba tầng, từ đơn giản tới học máy:
  1. Sổ tay từng mã (playbook): với mỗi coin × khung × thiết lập – số lần, tỉ lệ chạm MT1, lãi TB (R) trên lịch sử CỦA RIÊNG MÃ ĐÓ,
     co về trung bình toàn thị trường khi mẫu ít (shrinkage, k=15) → nhãn ƯU TIÊN / ĐƯỢC / TRÁNH.
  2. Tinh chỉnh mục tiêu theo mã: thử MT1 ở 1R / 1,5R / 2R / 3R trên lịch sử mã; chỉ nhận mức khác mặc định khi tốt hơn rõ
     ở CẢ nửa cũ và nửa gần đây của dữ liệu (chống "học thuộc").
  3. Học máy (gradient boosting, scikit-learn) dự báo xác suất chạm MT1 trước cắt lỗ cho từng tín hiệu, từ đặc trưng tại thời điểm
     tín hiệu: RSI, khoảng cách EMA/MA theo ATR, biến động, khối lượng bất thường, đà 10/30 nến, độ dốc xu hướng, độ NÉN giá
     (tam giác – đỉnh hạ dần & đáy nâng dần), vị trí Fibonacci trong biên độ 55 nến, R:R, độ rộng cắt lỗ, khung lớn, dòng tiền,
     BTC trên/dưới MA200, và "trí nhớ" của mã (tỉ lệ thắng quá khứ của chính thiết lập đó trên mã, chỉ dùng dữ liệu trước tín hiệu).
     Kiểm tra ngoài mẫu theo thời gian (20% gần nhất); chỉ dùng khi tốt hơn thống kê thuần.

Bộ nhớ: data/coinmodel/dataset.parquet (cộng dồn mỗi lượt đầy đủ, không mất dữ liệu cũ khi nguồn nến bị cắt bớt),
model.pkl + summary.json (huấn luyện lại mỗi 7 ngày, hoặc khi chưa có).
"""
from __future__ import annotations

import json
import logging
import pickle
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd

from . import indicators as ind

log = logging.getLogger("coinmodel")
SETUPS = ["pullback_up", "pullback_dn", "breakout_up", "breakout_dn", "oversold_up", "overbought_dn", "smc_sweep_up", "smc_sweep_dn", "smc_ob_up", "smc_ob_dn"]
FEATS = ["rsi", "d20", "d50", "dslow", "atrp", "volz", "mom10", "mom30", "slope50", "compress", "hi_slope", "lo_slope", "tri", "fibpos",
         "stop_atr", "r1", "side", "htf", "mf", "btc", "tf_d", "setup_i", "prior_win", "prior_n"]
K_SHRINK = 15
RETRAIN_DAYS = 7
HTF = {"h+": 1, "h0": 0, "h-": -1}


def _path(name: str):
    from ..data import store
    p = store.path("coinmodel")
    p.mkdir(parents=True, exist_ok=True)
    return p / name


def _roll_slope(y: np.ndarray, w: int) -> np.ndarray:
    """Độ dốc hồi quy tuyến tính trượt (đơn vị: giá / nến)."""
    n = len(y)
    x = np.arange(n, dtype=float)
    s = pd.Series(y)
    mx, my = pd.Series(x).rolling(w).mean().values, s.rolling(w).mean().values
    mxy = pd.Series(x * y).rolling(w).mean().values
    return (mxy - mx * my) / ((w * w - 1) / 12.0)


def frame(df: pd.DataFrame, tf: str) -> dict:
    """Đặc trưng theo từng nến (mảng) – tính một lần cho cả chuỗi."""
    c, h, l = df["close"].values.astype(float), df["high"].values.astype(float), df["low"].values.astype(float)
    v = df["volume"].values.astype(float)
    cs = df["close"]
    e20, e50 = ind.ema(cs, 20).values, ind.ema(cs, 50).values
    slow = (ind.sma(cs, 200) if tf == "d" else ind.ema(cs, 100)).values
    atr = ind.atr(df, 14).values
    a = np.where(atr > 0, atr, np.nan)
    vma, vsd = pd.Series(v).rolling(20).mean().values, pd.Series(v).rolling(20).std().values
    hh20, ll20 = pd.Series(h).rolling(20).max().values, pd.Series(l).rolling(20).min().values
    hh60, ll60 = pd.Series(h).rolling(60).max().values, pd.Series(l).rolling(60).min().values
    hh55, ll55 = pd.Series(h).rolling(55).max().values, pd.Series(l).rolling(55).min().values
    hs, ls = _roll_slope(h, 30), _roll_slope(l, 30)
    with np.errstate(divide="ignore", invalid="ignore"):
        F = {"rsi": ind.rsi(cs, 14).values, "d20": (c - e20) / a, "d50": (c - e50) / a, "dslow": (c - slow) / a, "atrp": atr / c * 100,
             "volz": (v - vma) / np.where(vsd > 0, vsd, np.nan), "mom10": (c / np.roll(c, 10) - 1) * 100, "mom30": (c / np.roll(c, 30) - 1) * 100,
             "slope50": _roll_slope(e50, 10) / a, "compress": (hh20 - ll20) / np.where(hh60 - ll60 > 0, hh60 - ll60, np.nan),
             "hi_slope": hs / a * 10, "lo_slope": ls / a * 10, "tri": (ls - hs) / a * 10, "fibpos": (c - ll55) / np.where(hh55 - ll55 > 0, hh55 - ll55, np.nan), "_atr": atr}
    F["mom10"][:10] = np.nan
    F["mom30"][:30] = np.nan
    return F


def row(F: dict, i: int, g: dict, tf: str, btc: int, prior: tuple[float, int]) -> dict:
    a = F["_atr"][i]
    e, s, t1 = g["e"], g["s"], g["t1"]
    risk = abs(e - s) or np.nan
    r = {k: (float(F[k][i]) if np.isfinite(F[k][i]) else np.nan) for k in FEATS if k in F}
    sd = 1 if g["side"] in (1, "long") else -1
    r.update({"stop_atr": risk / a if a and a > 0 else np.nan, "r1": abs(t1 - e) / risk, "side": sd, "htf": HTF.get(g.get("htf"), 0), "mf": float(g.get("mf") or 0),
              "btc": btc, "tf_d": 1 if tf == "d" else 0, "setup_i": SETUPS.index(g["setup"]) if g["setup"] in SETUPS else -1, "prior_win": prior[0], "prior_n": prior[1]})
    return r


def collect(key: str, tf: str, df: pd.DataFrame, res: list[dict], reg: np.ndarray) -> list[dict]:
    """Một dòng dữ liệu huấn luyện cho mỗi tín hiệu lịch sử đã biết kết quả."""
    if not res:
        return []
    F = frame(df, tf)
    out, seen = [], {}
    for g in sorted(res, key=lambda x: x["i"]):
        st = g["setup"]
        w, n = seen.get(st, (0, 0))
        prior = ((w + 0.4 * 3) / (n + 3), n)              # trí nhớ của mã: chỉ tín hiệu TRƯỚC đó (không nhìn trước)
        r = row(F, g["i"], g, tf, 1 if reg[g["i"]] > 0 else -1, prior)
        r.update({"k": key, "tf": tf, "setup": st, "t": pd.Timestamp(g["t"]).isoformat()[:16], "y": int(bool(g["hit1"])), "R": float(g["R"])})
        out.append(r)
        seen[st] = (w + int(bool(g["hit1"])), n + 1)
    return out


# ------------------------------------------------------------------ mục tiêu tối ưu theo mã (mô phỏng nhanh 1 mục tiêu)
def _tune_targets(df: pd.DataFrame, res: list[dict], horizon: int = 60) -> dict:
    h, l, c = df["high"].values, df["low"].values, df["close"].values
    n = len(c)
    M = [1.0, 1.5, 2.0, 3.0]
    rows = []
    for g in res:
        i, e, s = g["i"], g["e"], g["s"]
        sd = 1 if g["side"] in (1, "long") else -1
        risk = abs(e - s)
        j1 = min(n, i + 1 + horizon)
        if risk <= 0 or j1 - i - 1 < 5:
            continue
        hh, ll = h[i + 1:j1], l[i + 1:j1]
        stop_hit = (ll <= s) if sd == 1 else (hh >= s)
        si = int(np.argmax(stop_hit)) if stop_hit.any() else 10 ** 9
        out = []
        for m in M:
            t = e + sd * m * risk
            th = (hh >= t) if sd == 1 else (ll <= t)
            ti = int(np.argmax(th)) if th.any() else 10 ** 9
            if ti < si:
                out.append(m)
            elif si < 10 ** 9:
                out.append(-1.0)
            else:
                out.append((c[j1 - 1] - e) / risk * sd)
        rows.append((g["t"], out))
    if len(rows) < 20:
        return {}
    rows.sort(key=lambda x: x[0])
    A = np.array([r[1] for r in rows]) - 2 * 0.0015 * 3        # phí + trượt giá (xấp xỉ theo R)
    half = len(A) // 2
    old, new = A[:half].mean(0), A[half:].mean(0)
    base = M.index(1.5)
    best = int(np.argmax(A.mean(0)))
    ok = best != base and old[best] - old[base] > 0.05 and new[best] - new[base] > 0.05
    return {"m": M[best] if ok else None, "n": len(A), "avgR": {str(m): round(float(x), 3) for m, x in zip(M, A.mean(0))}}


class Memory:
    """Bộ nhớ dùng trong một lượt đầy đủ: gom dữ liệu, học (mỗi tuần), lập sổ tay từng mã, chấm xác suất cho tín hiệu mới."""

    def __init__(self):
        self.rows: list[dict] = []
        self.tune: dict = {}
        self.model = None
        self.summary: dict = {}

    def add(self, key, tf, df, res, reg):
        try:
            self.rows += collect(key, tf, df, res, reg)
            if res and len(res) >= 20:
                t = _tune_targets(df, res)
                if t:
                    self.tune.setdefault(key, {})[tf] = t
        except Exception as e:  # noqa: BLE001
            log.warning("coinmodel %s %s: %s", key, tf, e)

    # ---- dữ liệu: cộng dồn vào bộ nhớ (tín hiệu cũ không mất khi nguồn nến chỉ trả N nến gần nhất)
    def dataset(self) -> pd.DataFrame:
        new = pd.DataFrame(self.rows)
        p = _path("dataset.parquet")
        if p.exists():
            try:
                old = pd.read_parquet(p)
                new = pd.concat([old, new], ignore_index=True) if len(new) else old
            except Exception as e:  # noqa: BLE001
                log.warning("đọc dataset cũ lỗi: %s", e)
        if new.empty:
            return new
        new = new.drop_duplicates(["k", "tf", "setup", "t"], keep="last").sort_values("t").tail(600_000).reset_index(drop=True)
        new.to_parquet(p, index=False)
        return new

    def train(self, D: pd.DataFrame, force: bool = False) -> dict:
        prev = self._load_summary()
        due = force or not prev.get("trained_at") or datetime.now(timezone.utc) - datetime.fromisoformat(prev["trained_at"]) >= timedelta(days=RETRAIN_DAYS)
        if not due and _path("model.pkl").exists():
            try:
                self.model = pickle.loads(_path("model.pkl").read_bytes())
                return prev.get("ml") or {}
            except Exception:  # noqa: BLE001
                pass
        try:
            from sklearn.ensemble import HistGradientBoostingClassifier
            from sklearn.metrics import brier_score_loss, roc_auc_score
        except ImportError:
            log.warning("Chưa cài scikit-learn – bỏ phần học máy")
            return {"ok": False, "why": "chưa cài scikit-learn"}
        if len(D) < 2000:
            return {"ok": False, "why": f"mới có {len(D)} tín hiệu – cần ≥ 2.000"}
        X, y = D[FEATS].astype(float), D["y"].astype(int)
        cut = int(len(D) * 0.8)
        mk = lambda: HistGradientBoostingClassifier(max_iter=250, learning_rate=0.05, max_leaf_nodes=31, min_samples_leaf=80, l2_regularization=1.0,  # noqa: E731
                                                    categorical_features=[FEATS.index("setup_i")], random_state=7)
        m = mk().fit(X.iloc[:cut], y.iloc[:cut])
        p = m.predict_proba(X.iloc[cut:])[:, 1]
        yt = y.iloc[cut:]
        # đường cơ sở: tỉ lệ chạm MT1 của đúng thiết lập × khung trong phần huấn luyện
        base_tab = D.iloc[:cut].groupby(["tf", "setup"])["y"].mean()
        pb = np.array([base_tab.get((a, b), y.iloc[:cut].mean()) for a, b in zip(D["tf"].iloc[cut:], D["setup"].iloc[cut:])])
        auc, auc_b = float(roc_auc_score(yt, p)), float(roc_auc_score(yt, pb)) if len(set(pb)) > 1 else 0.5
        bri, bri_b = float(brier_score_loss(yt, p)), float(brier_score_loss(yt, pb))
        # độ quan trọng đặc trưng: hoán vị trên mẫu ngoài (nhanh, 4 000 dòng)
        imp = {}
        try:
            from sklearn.inspection import permutation_importance
            sm = min(4000, len(yt))
            pi = permutation_importance(m, X.iloc[cut:cut + sm], yt.iloc[:sm], n_repeats=3, random_state=1, scoring="roc_auc")
            imp = {f: round(float(v), 4) for f, v in sorted(zip(FEATS, pi.importances_mean), key=lambda t: -t[1])[:12]}
        except Exception as e:  # noqa: BLE001
            log.warning("importance: %s", e)
        # hiệu chỉnh: lãi TB của nhóm tín hiệu mô hình chấm cao nhất (top 30%) so với tất cả
        R = D["R"].iloc[cut:].values
        hiq = p >= np.quantile(p, 0.7)
        ok = auc > auc_b + 0.01 and bri < bri_b
        self.model = mk().fit(X, y)                     # học lại trên toàn bộ dữ liệu để dùng
        _path("model.pkl").write_bytes(pickle.dumps(self.model))
        return {"ok": bool(ok), "n": int(len(D)), "n_test": int(len(yt)), "auc": round(auc, 3), "auc_base": round(auc_b, 3), "brier": round(bri, 4), "brier_base": round(bri_b, 4),
                "base_rate": round(float(yt.mean()) * 100, 1), "avgR_all": round(float(R.mean()), 3), "avgR_top30": round(float(R[hiq].mean()), 3), "importance": imp,
                "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}

    def playbook(self, D: pd.DataFrame) -> dict:
        if D.empty:
            return {}
        g = D.groupby(["tf", "setup"]).agg(n=("y", "size"), w=("y", "mean"), r=("R", "mean"))
        cut = (pd.Timestamp.utcnow().tz_localize(None) - pd.Timedelta(days=365)).isoformat()[:16]
        out = {}
        for (k, tf, st), q in D.groupby(["k", "tf", "setup"]):
            n = len(q)
            gl = g.loc[(tf, st)]
            shr = (n * q["R"].mean() + K_SHRINK * gl["r"]) / (n + K_SHRINK)
            rec = q[q["t"] >= cut]["R"]
            play = "prefer" if shr >= 0.15 and n >= 5 else "avoid" if (shr < 0 and n >= 8) else "ok" if shr >= 0.02 else "weak"
            out.setdefault(k, {}).setdefault(tf, {})[st] = {"n": int(n), "win": round(float(q["y"].mean()) * 100, 1), "avgR": round(float(q["R"].mean()), 3),
                                                            "shr": round(float(shr), 3), "rec": round(float(rec.mean()), 3) if len(rec) >= 5 else None, "play": play}
        return out

    def finish(self, force: bool = False) -> dict:
        D = self.dataset()
        ml = self.train(D, force) if not D.empty else {"ok": False, "why": "chưa có dữ liệu"}
        prev = self._load_summary()
        S = {"at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "trained_at": ml.get("trained_at") or prev.get("trained_at"), "ml": ml if ml.get("trained_at") else (prev.get("ml") or ml),
             "n_rows": int(len(D)), "coins": self.playbook(D), "tune": {**(prev.get("tune") or {}), **self.tune}}
        _path("summary.json").write_text(json.dumps(S, ensure_ascii=False, default=str), encoding="utf-8")
        self.summary = S
        return S

    def _load_summary(self) -> dict:
        try:
            return json.loads(_path("summary.json").read_text())
        except (OSError, ValueError):
            return {}


# ------------------------------------------------------------------ dùng mô hình cho tín hiệu hiện tại (lượt đầy đủ & lượt 15 phút)
class Scorer:
    def __init__(self, summary: dict | None = None, model=None):
        self.S = summary if summary is not None else Memory()._load_summary()
        self.m = model
        if self.m is None and (self.S.get("ml") or {}).get("ok"):
            try:
                self.m = pickle.loads(_path("model.pkl").read_bytes())
            except Exception:  # noqa: BLE001
                self.m = None
        self._F = {}

    def annotate(self, x: dict, df: pd.DataFrame, btc_up: bool) -> dict:
        k, tf, st = x["k"], x["tf"], x["setup"]
        pb = (((self.S.get("coins") or {}).get(k) or {}).get(tf) or {}).get(st)
        if pb:
            x["play"], x["coin_n"], x["coin_win"], x["coin_R"] = pb["play"], pb["n"], pb["win"], pb["shr"]
        tn = ((self.S.get("tune") or {}).get(k) or {}).get(tf)
        if tn and tn.get("m"):
            x["m_best"] = tn["m"]
        if self.m is not None and df is not None and len(df) > 60:
            try:
                key = (k, tf, len(df))
                if key not in self._F:
                    self._F = {key: frame(df.reset_index(drop=True), tf)}
                F = self._F[key]
                prior = ((pb["win"] / 100 * pb["n"] + 1.2) / (pb["n"] + 3), pb["n"]) if pb else (0.4, 0)
                r = row(F, len(df) - 1, {**x, "side": 1 if x["side"] == "long" else -1}, tf, 1 if btc_up else -1, prior)
                p = float(self.m.predict_proba(pd.DataFrame([r])[FEATS].astype(float))[:, 1][0])
                x["pm"] = round(p * 100, 1)
            except Exception as e:  # noqa: BLE001
                log.debug("score %s: %s", k, e)
        return x

    def site(self) -> dict:
        """Bản gọn cho trang web."""
        S = self.S or {}
        return {"at": S.get("at"), "trained_at": S.get("trained_at"), "ml": S.get("ml"), "n_rows": S.get("n_rows"), "coins": S.get("coins"), "tune": S.get("tune")}
