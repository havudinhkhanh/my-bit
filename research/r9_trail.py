"""Vòng 9 bổ sung: cắt lỗ đuổi 1,5%/1% (hk_tra/hk_trg) so với giữ 60 phút, theo từng kiểu vào. Chạy: python research/r9_trail.py <round9.json.gz>"""
import sys,numpy as np,pandas as pd
sys.argv=["x", sys.argv[1] if len(sys.argv) > 1 else "research_out/round9.json.gz"]
src=open(__file__.replace("r9_trail.py","r9_analyze.py")).read().split("def rev_pnl")[0]
g={}; exec(compile(src,"r9","exec"),g); X=g["X"]; DAYS=g["DAYS"]
IN_M,IN_T,OUT_T,OUT_S,CAT,H=2.0,15.0,18.0,28.0,3500,60
def sim(r,tra=150,trg=100,slip=0):
    o,b,w=r.o,r.b,r.w; cin=(IN_T+slip) if r.D=="0.0" else IN_M; pk=-1e9; adj=slip if r.D=="0.0" else 0
    for k in range(H):
        if w[k]-adj<=-CAT: return -CAT-cin-OUT_S+adj
        if tra and pk>=tra and w[k]-adj<=pk-trg: return min(pk-trg,o[k]-adj)-cin+adj-OUT_S*0+(-OUT_T)
        pk=max(pk,b[k]-adj)
    return o[H]-cin-OUT_T
# note: slip shifts entry price worse by slip bps: pnl path relative to worse entry = path - slip
def run(sel,**kw):
    S=X[sel].sort_values("T"); v=np.array([sim(r,**kw) for r in S.itertuples()])
    eq=np.cumprod(1+v/1e4*0.025); dd=(1-eq/np.maximum.accumulate(eq)).max()*100
    return f"{len(v):5} lệnh {len(v)/DAYS:4.2f}/ngày · TB {v.mean():+6.1f} · thắng {(v>0).mean()*100:4.1f}% · {v.sum()/DAYS:+6.0f} bps/ngày · tổng {(eq[-1]-1)*100:+6.1f}% · sụt {dd:4.1f}%"
mkE=X.groupby("T").D.transform(lambda s:(s=="0.0").any())
for lab,sel in [("mua ngay",X.D=="0.0"),("chờ 1.25",X.D=="1.25"),("chờ 1.5",X.D=="1.5")]:
    print(lab,"giữ 60p   ",run(sel,tra=0)); print(lab,"đuổi 1.5/1",run(sel))
print("mua ngay đuổi, trượt thêm 10bps", run(X.D=="0.0",slip=10))
print("mua ngay đuổi, trượt thêm 20bps", run(X.D=="0.0",slip=20))
pol15=(X.D=="0.0")|((X.D=="1.5")&~mkE); pol125=(X.D=="0.0")|((X.D=="1.25")&~mkE)
print("TK nhỏ: ngay/1.5  đuổi",run(pol15)); print("TK nhỏ: ngay/1.25 đuổi",run(pol125))
print("TK nhỏ: ngay/1.5  giữ ",run(pol15,tra=0)); print("TK nhỏ: ngay/1.25 giữ ",run(pol125,tra=0))
