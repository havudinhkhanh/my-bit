"""So nến 1 phút của 1 hợp đồng trên Binance THẬT và Binance DEMO trong cùng khoảng thời gian (xem lệnh chờ trên Demo vì sao không khớp).
Chạy: RS_SYM=LABUSDT RS_FROM=2026-10-28T02:00 RS_TO=2026-10-28T02:16 python research/demo_cmp.py"""
import datetime as dt, json, os, urllib.request
sym = os.environ.get("RS_SYM", "LABUSDT")
t0 = int(dt.datetime.fromisoformat(os.environ.get("RS_FROM", "2026-10-28T02:00")).replace(tzinfo=dt.timezone.utc).timestamp() * 1000)
t1 = int(dt.datetime.fromisoformat(os.environ.get("RS_TO", "2026-10-28T02:16")).replace(tzinfo=dt.timezone.utc).timestamp() * 1000)
os.makedirs("research_out", exist_ok=True)
out = open("research_out/demo_cmp.log", "w")
def log(*a): print(*a); print(*a, file=out)
def get(u):
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "mybit"}), timeout=20) as r: return json.loads(r.read())
    except Exception as e: return {"err": str(e)}
for name, base in (("THẬT", "https://fapi.binance.com"), ("DEMO", "https://demo-fapi.binance.com"), ("DEMO-testnet", "https://testnet.binancefuture.com")):
    K = get(f"{base}/fapi/v1/klines?symbol={sym}&interval=1m&startTime={t0}&endTime={t1}&limit=100")
    if isinstance(K, dict): log(name, "lỗi", K); continue
    log(f"\n== {name} {sym}: {len(K)} nến")
    for k in K: log(dt.datetime.fromtimestamp(k[0] / 1000, dt.timezone.utc).strftime("%H:%M"), "O", k[1], "H", k[2], "L", k[3], "C", k[4], "KL", k[5], "số lệnh", k[8])
    A = get(f"{base}/fapi/v1/aggTrades?symbol={sym}&startTime={t0}&endTime={min(t1, t0 + 3600_000)}&limit=1000")
    if isinstance(A, list) and A: log(name, "aggTrades:", len(A), "giá cao nhất", max(float(a["p"]) for a in A), "thấp nhất", min(float(a["p"]) for a in A))
    else: log(name, "aggTrades", A if isinstance(A, dict) else "trống")
    D = get(f"{base}/fapi/v1/depth?symbol={sym}&limit=5"); log(name, "sổ lệnh lúc này", json.dumps(D)[:400])
