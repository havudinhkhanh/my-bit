# chép bảng mới vào site, CẮT cho khớp đúng chỉ số khung bảng đang chạy (so khung đầu bảng cũ ↔ bảng mới) → các mốc a/b/on trong mascot.js giữ nguyên
import json, numpy as np, cv2, subprocess, sys
O = sys.argv[1]; ONLY = sys.argv[2].split(",") if len(sys.argv) > 2 else None
def dec(a):
    pts=[];x=y=0
    for i in range(1,len(a),2):
        if i==1: x,y=a[1],a[2]
        else: x+=a[i]; y+=a[i+1]
        pts.append((x,y))
    return a[0], np.array(pts,float)
def ras(fr):
    m=np.zeros((340,800),np.uint8)
    for a in fr[3]:
        t,p=dec(a); p[:,0]+=400; p[:,1]+=310
        if t==0: cv2.fillPoly(m,[p.astype(np.int32)],1)
    return m
MAP={"vwalk":"walk","vrun":"run","vsit":"sit_idle","vs2st":"sit_to_stand","vst2s":"stand_to_sit","vturn":"turn","vgpaw":"groom_paw","vgbody":"groom_body","vstr":"stretch","vs2l":"sit_to_loaf","vl2c":"loaf_to_curl","vsleep":"sleep","vwake":"wake","vroll":"roll","vstalk":"stalk","vmeow":"meow","vannoy":"annoyed","vpounce":"pounce"}
S="/home/claude/my-bit/site"
for o,nw in MAP.items():
    if ONLY and o not in ONLY: continue
    try: new=json.load(open(f"{O}/{nw}.json"))
    except FileNotFoundError: print(o, "chưa có"); continue
    old=json.loads(subprocess.check_output(["git","-C","/home/claude/my-bit","show",f"HEAD:site/mascot-seq-{o}.json"]))
    A=ras(old['f'][0]); sc=[((A&ras(new['f'][j])).sum()/max(1,(A|ras(new['f'][j])).sum()),j) for j in range(0,min(len(new['f']),14))]
    iou,off=max(sc); L=len(old['f'])
    if new['loop']: off=0; L=len(new['f'])
    f=new['f'][off:off+L]; tx=new['tx'][off:off+L]; m=new['m'][off:off+L-(0 if new['loop'] else 1)]
    if new['loop'] and len(m) < len(f): m=new['m'][:len(f)]
    out=dict(new); out['f']=f; out['tx']=tx; out['m']=m; out['n']=len(f)
    if 'st' in old and 'st' not in new: out['st']=old['st']
    open(f"{S}/mascot-seq-{o}.json","w").write(json.dumps(out,separators=(",",":")))
    print(o, "off", off, "iou", round(iou,3), "keys", len(f), "mids", len(m), "old", len(old['f']))
