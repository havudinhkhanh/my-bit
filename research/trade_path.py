"""Đường giá 1 phút của một lệnh đã đóng – để xem lúc nào lệnh đang lời nhất, vì sao kết thúc lỗ.
Lấy nến từ nhiều sàn (Binance thật bị chặn từ máy GitHub ở Mỹ → dùng OKX / Gate / Bitget / MEXC / Binance testnet để đối chiếu).
Chạy: RS_SYM=BEAT RS_FROM=2026-10-28T06:10 RS_TO=2026-10-28T07:25 RS_SIDE=-1 RS_E=0.1019135 RS_T0=2026-10-28T06:18 RS_T1=2026-10-28T07:18 python research/trade_path.py"""
import datetime as dt, json, os, urllib.request

S = os.environ.get("RS_SYM", "BEAT").upper()
iso = lambda k, d: dt.datetime.fromisoformat(os.environ.get(k, d)).replace(tzinfo=dt.timezone.utc)
A, B = iso("RS_FROM", "2026-10-28T06:10"), iso("RS_TO", "2026-10-28T07:25")
T0, T1 = iso("RS_T0", "2026-10-28T06:18"), iso("RS_T1", "2026-10-28T07:18")
side, E = int(os.environ.get("RS_SIDE", "-1")), float(os.environ.get("RS_E", "0.1019135"))
a, b = int(A.timestamp() * 1000), int(B.timestamp() * 1000)
os.makedirs("research_out", exist_ok=True)
out = open("research_out/trade_path.log", "w")
def log(*x): print(*x); print(*x, file=out, flush=True)
def get(u):
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0 mybit"}), timeout=20) as r: return json.loads(r.read())
    except Exception as e: return {"err": str(e)}

def okx():
    r = get(f"https://www.okx.com/api/v5/market/history-candles?instId={S}-USDT-SWAP&bar=1m&after={b + 60000}&limit=100")
    return [(int(k[0]), *map(float, k[1:5])) for k in r.get("data", [])] if isinstance(r, dict) and "data" in r else r
def gate():
    r = get(f"https://api.gateio.ws/api/v4/futures/usdt/candlesticks?contract={S}_USDT&interval=1m&from={a // 1000}&to={b // 1000}")
    return [(int(k["t"]) * 1000, float(k["o"]), float(k["h"]), float(k["l"]), float(k["c"])) for k in r] if isinstance(r, list) else r
def bitget():
    r = get(f"https://api.bitget.com/api/v2/mix/market/history-candles?symbol={S}USDT&productType=usdt-futures&granularity=1m&startTime={a}&endTime={b}&limit=200")
    return [(int(k[0]), *map(float, k[1:5])) for k in r.get("data", [])] if isinstance(r, dict) and r.get("data") else r
def mexc():
    r = get(f"https://contract.mexc.com/api/v1/contract/kline/{S}_USDT?interval=Min1&start={a // 1000}&end={b // 1000}")
    d = r.get("data") if isinstance(r, dict) else None
    return [(int(t) * 1000, o, h, l, c) for t, o, h, l, c in zip(d["time"], d["open"], d["high"], d["low"], d["close"])] if d and d.get("time") else r
def bnt():
    r = get(f"https://testnet.binancefuture.com/fapi/v1/klines?symbol={S}USDT&interval=1m&startTime={a}&endTime={b}&limit=200")
    return [(int(k[0]), *map(float, k[1:5])) for k in r] if isinstance(r, list) else r

for name, f in (("OKX", okx), ("Gate", gate), ("Bitget", bitget), ("MEXC", mexc), ("Binance-testnet", bnt)):
    K = f()
    if not isinstance(K, list) or not K: log(f"\n== {name}: không có ({str(K)[:160]})"); continue
    K = sorted(x for x in K if a <= x[0] <= b)
    log(f"\n== {name} {S}: {len(K)} nến · lệnh {'Short' if side < 0 else 'Long'} vào TB {E} · giữ {T0:%H:%M}→{T1:%H:%M} UTC")
    best = worst = None
    for t, o, h, l, c in K:
        tt = dt.datetime.fromtimestamp(t / 1000, dt.timezone.utc)
        inpos = T0 - dt.timedelta(minutes=1) <= tt <= T1
        fav = (E - l) / E * 1e4 if side < 0 else (h - E) / E * 1e4          # lời tốt nhất trong nến (bps)
        adv = (E - h) / E * 1e4 if side < 0 else (l - E) / E * 1e4          # xấu nhất trong nến
        now = side * (c - E) / E * 1e4
        if inpos:
            if best is None or fav > best[1]: best = (tt, fav, l if side < 0 else h)
            if worst is None or adv < worst[1]: worst = (tt, adv, h if side < 0 else l)
        log(f"{tt:%H:%M} {'•' if inpos else ' '} O {o:<10g} H {h:<10g} L {l:<10g} C {c:<10g} | lời/lỗ lúc đóng nến {now:+7.0f} bps · tốt nhất {fav:+6.0f} · xấu nhất {adv:+6.0f}")
    if best: log(f"→ {name}: lời nhiều nhất {best[1]:+.0f} bps lúc {best[0]:%H:%M} (giá {best[2]:g}); lỗ sâu nhất {worst[1]:+.0f} bps lúc {worst[0]:%H:%M} (giá {worst[2]:g})")
