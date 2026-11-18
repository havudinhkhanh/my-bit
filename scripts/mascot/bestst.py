# khung nào trong vòng đi / chạy giống dáng ĐỨNG nhất (cuối clip ngồi→đứng và quay đầu) → mèo bắt đầu đi từ khung đó, không phải hoà 2 dáng
import json, numpy as np, cv2, sys
O = sys.argv[1]
def dec(a):
    pts = []; x = y = 0
    for i in range(1, len(a), 2):
        if i == 1: x, y = a[1], a[2]
        else: x += a[i]; y += a[i + 1]
        pts.append((x, y))
    return a[0], np.array(pts, float)
def ras(fr, dx=0, flip=False):
    m = np.zeros((300, 700), np.uint8); h = np.zeros_like(m)
    for a in fr[3]:
        t, p = dec(a)
        if flip: p[:, 0] = -p[:, 0]
        p[:, 0] += 350 - dx; p[:, 1] += 280
        if t == 0: cv2.fillPoly(m, [p.astype(np.int32)], 1)
        elif t == 1: cv2.fillPoly(h, [p.astype(np.int32)], 1)
    return m & (1 - h)
s2 = json.load(open(f"{O}/sit_to_stand.json")); tu = json.load(open(f"{O}/turn.json"))
refs = [ras(s2["f"][84], s2["tx"][84]), ras(tu["f"][100], -tu["tx"][100], True)]      # quay đầu: dáng cuối lật lại (sau khi lật hướng)
for nm in ["walk", "run"]:
    d = json.load(open(f"{O}/{nm}.json")); sc = []
    for i, fr in enumerate(d["f"]):
        m = ras(fr, d["tx"][i]); sc.append(np.mean([(m & r).sum() / max(1, (m | r).sum()) for r in refs]))
    st = int(np.argmax(sc)); d["st"] = st; json.dump(d, open(f"{O}/{nm}.json", "w"), separators=(",", ":"))
    print(nm, "start frame", st, "iou", round(sc[st], 3), "frame0 iou", round(sc[0], 3))
