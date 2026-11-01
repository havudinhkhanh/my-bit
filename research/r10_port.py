"""Vòng 10 bổ sung: độ bền (bỏ lệnh lời đột biến) và DANH MỤC thật (tối đa K lệnh cùng lúc, 10% vốn/lệnh, lãi kép) cho S1 / S2 / S5. Chạy: python research/r10_port.py <round10.json.gz>"""
import gzip,json,bisect,numpy as np,pandas as pd,sys
D=json.load(gzip.open((sys.argv[1] if len(sys.argv) > 1 else "research_out/round10.json.gz"),"rt"))
FR={s:(np.array([x[0] for x in v]),np.array([x[1] for x in v])/1e4) for s,v in D["fr"].items()}
MAJ=set(D["maj"]); cost=lambda s:0.14 if s in MAJ else 0.30
def fund(s,side,t0,t1):
    if s not in FR: return 0.0
    T,f=FR[s]; a,b=bisect.bisect_right(T,t0),bisect.bisect_right(T,t1); return float(-side*f[a:b].sum())
def trades(kind,key,thr=None,dly=None):
    out=[]
    if kind=="s1":
        for x in D["s1"]:
            if x["r24"]>=thr and key in x["res"]:
                r,why,t2,b,w=x["res"][key]; out.append((x["t"],t2,max(-100,r-cost(x["s"])+fund(x["s"],-1,x["t"],t2)),x["s"]))
    if kind=="s2":
        for x in D["s2"]:
            if x["dly"]==dly and key in x["res"]:
                r,why,t2,b,w=x["res"][key]; out.append((x["t"],t2,max(-100,r-cost(x["s"])+fund(x["s"],-1,x["t"],t2)),x["s"]))
    if kind=="s5":
        for x in D["s5"]:
            if x["side"]==1 and x["f"]<=-thr*1e4 and key in x["res"]:
                r,why,t2,b,w=x["res"][key]; out.append((x["t"],t2,max(-100,r-cost(x["s"])+fund(x["s"],1,x["t"],t2)),x["s"]))
    return sorted(out)
def port(T,K=5,sz=0.10,label=""):
    eq=1.0; peak=1; dd=0; openp=[]; n=0; skip=0; yr={}; mx=0
    ev=[]
    for t0,t1,r,s in T: ev.append((t0,0,t1,r,s))
    ev.sort()
    for t0,_,t1,r,s in ev:
        # close positions ended before t0
        still=[]
        for p in openp:
            if p[0]<=t0: eq+=p[1]*p[2]/100; yr.setdefault(pd.Timestamp(p[0]*3600,unit="s").year,[]).append(p[1]*p[2]/100)
            else: still.append(p)
        openp=still; peak=max(peak,eq); dd=max(dd,1-eq/peak)
        if len(openp)>=K or any(p[3]==s for p in openp): skip+=1; continue
        openp.append((t1,eq*sz,r,s)); n+=1; mx=max(mx,len(openp))
    for p in openp: eq+=p[1]*p[2]/100
    yrs=(ev[-1][0]-ev[0][0])/24/365
    print(f"  {label:<46} K={K} {sz*100:.0f}%/lệnh: {n} lệnh vào ({skip} bỏ vì đầy) · vốn ×{eq:6.2f} ({(eq**(1/yrs)-1)*100:+.0f}%/năm) · sụt tối đa {dd*100:4.1f}%")
def robust(T,label):
    r=np.array([x[2] for x in T]); q=np.sort(r); k=max(1,len(r)//100)
    print(f"  {label:<46} TB {r.mean():+.2f}% · bỏ 1% lệnh lời nhất: TB {q[:-k].mean():+.2f}% · bỏ 5%: TB {q[:-max(1,len(r)//20)].mean():+.2f}% · lỗ ≤ -50%: {(r<=-50).mean()*100:.1f}% lệnh")
C=[("S2 short niêm yết 1 ngày, giữ 14 ngày, không cắt", trades("s2","336|None",dly=24)),
   ("S2 short niêm yết 1 ngày, giữ 14 ngày, cắt +50%", trades("s2","336|0.5",dly=24)),
   ("S2 short niêm yết 3 ngày, giữ 14 ngày, không cắt", trades("s2","336|None",dly=72)),
   ("S2 short niêm yết 1 ngày, giữ 7 ngày, không cắt", trades("s2","168|None",dly=24)),
   ("S1 short bơm ≥60%, giữ 7 ngày, không cắt", trades("s1","168|None",thr=60)),
   ("S1 short bơm ≥40%, giữ 3 ngày, không cắt", trades("s1","72|None",thr=40)),
   ("S1 short bơm ≥100%, giữ 7 ngày, không cắt", trades("s1","168|None",thr=100)),
   ("S5 long funding ≤-0.1%, giữ 3 ngày", trades("s5","72|None",thr=0.1)),
   ("S5 long funding ≤-0.2%, giữ 3 ngày", trades("s5","72|None",thr=0.2)),
   ("S5 long funding ≤-0.2%, giữ 3 ngày, cắt 20%", trades("s5","72|0.2",thr=0.2))]
print("== độ bền (bỏ lệnh lời đột biến)")
for l,T in C: robust(T,l)
print("== danh mục thật: tối đa K lệnh cùng lúc, mỗi lệnh 10% vốn hiện có (lãi kép), không 2 lệnh cùng coin")
for l,T in C:
    for K in (3,5,10): port(T,K,0.10,l)
