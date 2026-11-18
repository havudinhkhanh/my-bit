# Video (Google Flow, nền trắng, mèo đen nhìn ngang) → khung hình vector cho mascot.js (định dạng mascot-seq-*.json)
# mỗi khung: [w, h, eye|null, [[loại, x0, y0, dx, dy, ...], ...]]  loại 0 = thân đen, 1 = lỗ (mắt, khe giữa chân), 2 = vòng cổ vàng
import cv2, numpy as np, json, sys, os
SRC = sys.argv[1]; OUT = sys.argv[2]; os.makedirs(OUT, exist_ok=True)
CLIPS = ["walk", "run", "sit_idle", "sit_to_stand", "stand_to_sit", "turn"]
SIT_H = 231.0          # chiều cao dáng ngồi trong hệ đơn vị hiện tại của mèo

def load(clip):
    fs = sorted(os.listdir(f"{SRC}/{clip}"))
    return [cv2.imread(f"{SRC}/{clip}/{f}") for f in fs]

def soft(im):       # 1 = lông đen, 0 = nền trắng (mềm ở mép)
    L = cv2.GaussianBlur(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY).astype(np.float32), (0, 0), 1.2)
    return np.clip((175 - L) / 90.0, 0, 1)

def goldmask(im):
    hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
    g = ((hsv[..., 0] >= 5) & (hsv[..., 0] <= 38) & (hsv[..., 1] > 75) & (hsv[..., 2] > 105)).astype(np.uint8)
    return cv2.morphologyEx(g, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))

def biggest(m):
    n, lab, st, _ = cv2.connectedComponentsWithStats(m.astype(np.uint8), 8)
    if n <= 1: return m.astype(np.uint8)
    big = st[1:, 4].max(); keep = [i for i in range(1, n) if st[i, 4] >= max(400, big * 0.02)]
    return np.isin(lab, keep).astype(np.uint8)

def fill_small(m, amax):
    inv = (1 - m).astype(np.uint8); n, lab, st, _ = cv2.connectedComponentsWithStats(inv, 4)
    out = m.copy()
    for i in range(1, n):
        x, y, w, h, a = st[i]
        if a < amax and x > 0 and y > 0 and x + w < m.shape[1] and y + h < m.shape[0]: out[lab == i] = 1
    return out

def frames_masks(clip):
    ims = load(clip); S = [soft(im) for im in ims]; G = [goldmask(im) for im in ims]; del ims
    M = []
    for i in range(len(S)):        # làm mềm theo thời gian 0,2/0,6/0,2 → mép lông không lấp lánh giữa các khung
        a = S[max(0, i - 1)]; c = S[min(len(S) - 1, i + 1)]; s = 0.2 * a + 0.6 * S[i] + 0.2 * c
        m = ((s > 0.5) | (G[i] > 0)).astype(np.uint8)
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        m = biggest(m); m = fill_small(m, 900)
        M.append(m)
    return None, M, G

def torso(m, H):        # tâm thân (bỏ chân, đuôi, tai) – mốc đặt mèo ổn định
    k = max(9, int(H * 0.16) | 1); e = cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    ys, xs = np.nonzero(e if e.sum() > 500 else m); return xs.mean(), ys.mean()

def eyes_of(m, g, ys0):
    ys, xs = np.nonzero(m); top = ys.min(); bot = ys.max(); H = bot - top
    band = (ys < top + 0.45 * H)
    cx = xs.mean(); tx = xs[ys == top].mean(); right = tx >= cx          # tai ở phía nào thân → hướng mặt
    hx = xs[band].max() if right else xs[band].min()                      # điểm đầu mũi
    hy = ys[band][np.argmax(xs[band]) if right else np.argmin(xs[band])]
    n, lab, st, cen = cv2.connectedComponentsWithStats(g, 8); E = []
    for i in range(1, n):
        x, y, w, h, a = st[i]
        if a < 25 or a > 700 or max(w, h) > 2.6 * min(w, h): continue
        d = np.hypot(cen[i][0] - hx, cen[i][1] - hy)
        if d < 0.24 * H and cen[i][1] < top + 0.5 * H: E.append((d, i))
    E.sort(); E = E[:2]
    em = np.isin(lab, [i for _, i in E]).astype(np.uint8)
    if em.any(): em = cv2.dilate(em, np.ones((3, 3), np.uint8))
    eye = None
    if E: i = E[0][1]; eye = (cen[i][0], cen[i][1])
    return em, eye, right

def polys_of(m, em, gm, T):     # T(x, y) → đơn vị
    body = (m & (1 - em)).astype(np.uint8)
    cs, hi = cv2.findContours(body, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    P = []
    if hi is None: return P
    for c, h in zip(cs, hi[0]):
        if cv2.contourArea(c) < (60 if h[3] >= 0 else 300): continue
        a = cv2.approxPolyDP(c, 1.1, True)[:, 0, :].astype(np.float32)
        P.append((1 if h[3] >= 0 else 0, a))
    gold = cv2.morphologyEx((gm & m & (1 - em)).astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    cs, _ = cv2.findContours(gold, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    for c in cs:
        if cv2.contourArea(c) < 40: continue
        P.append((2, cv2.approxPolyDP(c, 1.0, True)[:, 0, :].astype(np.float32)))
    out = []
    for t, a in P:
        U = np.array([T(x, y) for x, y in a]); r = np.round(U).astype(int)
        keep = [0] + [i for i in range(1, len(r)) if (r[i] != r[i - 1]).any()]; r = r[keep]
        if len(r) < 3: continue
        ar = 0.5 * np.sum(r[:, 0] * np.roll(r[:, 1], -1) - np.roll(r[:, 0], -1) * r[:, 1])
        if (t == 1 and ar < 0) or (t != 1 and ar > 0): r = r[::-1]          # thân & vàng 1 chiều, lỗ chiều ngược lại (tô "nonzero" khoét lỗ đúng)
        d = [t, int(r[0, 0]), int(r[0, 1])]
        for i in range(1, len(r)): d += [int(r[i, 0] - r[i - 1, 0]), int(r[i, 1] - r[i - 1, 1])]
        out.append(d)
    return out

def heights(M):
    H = []
    for m in M: ys, xs = np.nonzero(m); H.append(ys.max() - ys.min())
    return np.array(H, float)

def ground_of(M):
    return float(np.percentile([np.nonzero(m)[0].max() for m in M], 90))

def smooth(a, w):
    if w <= 1: return np.array(a, float)
    p = w // 2; b = np.pad(np.array(a, float), p, mode="edge"); k = np.ones(w) / w
    return np.convolve(b, k, mode="valid")

def activity(M):
    d = [0] + [float(np.logical_xor(M[i], M[i - 1]).sum()) for i in range(1, len(M))]
    return np.array(d)

import pickle
SHP = (720, 1280)
def pk(L): return [np.packbits(m.astype(bool)) for m in L]
def up(L): return [np.unpackbits(p)[:SHP[0] * SHP[1]].reshape(SHP).astype(np.uint8) for p in L]
def cached(c):
    fn = f"{OUT}/cache2_{c}.pkl"
    if not os.path.exists(fn):
        _, M, G = frames_masks(c); pickle.dump((pk(M), pk(G)), open(fn, "wb")); del M, G
    return fn
FN = {c: cached(c) for c in CLIPS}
def get(c): M, G = pickle.load(open(FN[c], "rb")); return None, up(M), up(G)
def tarea(M):      # diện tích thân (bỏ chân, đuôi bằng phép mở với nhân cỡ ~16% chiều cao) – đo cỡ mèo ổn định hơn chiều cao (đi thì cúi đầu, hạ đuôi)
    out = []
    for m in M:
        ys = np.nonzero(m)[0]; H = ys.max() - ys.min(); kk = max(9, int(H * 0.16) | 1)
        out.append(float(cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kk, kk))).sum()))
    return np.array(out)
Hh, TA = {}, {}
for c in CLIPS:
    _, M_, _ = get(c); Hh[c] = heights(M_); TA[c] = tarea(M_); del M_
hs_idle = np.median(Hh["sit_idle"])
a, b = Hh["sit_to_stand"], Hh["stand_to_sit"]; ta, tb = TA["sit_to_stand"], TA["stand_to_sit"]
ka, kb = SIT_H / np.median(a[:12]), SIT_H / np.median(b[-12:])        # 2 clip chuyển dáng: cỡ theo phần NGỒI (so với ngồi yên)
AU = (np.median(ta[-12:]) * ka ** 2 + np.median(tb[:12]) * kb ** 2) / 2      # diện tích thân lúc ĐỨNG (đơn vị²)
ks = lambda A: float(np.sqrt(AU / A))
ust = AU
K = {"sit_idle": SIT_H / hs_idle, "sit_to_stand": (ka + ks(np.median(ta[-12:]))) / 2, "stand_to_sit": (kb + ks(np.median(tb[:12]))) / 2,
     "walk": ks(np.median(TA["walk"])), "run": ks(np.median(TA["run"])), "turn": ks(np.median(TA["turn"][:12]))}
print("stand units", round(ust, 1), {k: round(v, 4) for k, v in K.items()})

meta = {}
for clip in CLIPS:
    ims, M, G = get(clip); k = K[clip]; gy = ground_of(M); n = len(M)
    HH = Hh[clip].mean()
    tor = [torso(m, HH) for m in M]
    loop = clip in ("walk", "run", "sit_idle")
    if loop: ax = smooth([t[0] for t in tor], 25)          # vòng lặp: mốc = tâm thân làm mượt 1 giây → không trôi, giữ nhịp lắc tự nhiên
    else: ax = np.full(n, tor[0][0])                         # chuyển dáng / quay: máy quay đứng yên → giữ đúng chuyển động thật; độ dời cuối clip trả về dx
    # ---- cắt đoạn có chuyển động (clip chuyển dáng dài 8 giây nhưng động tác chỉ vài giây)
    a0, a1 = 0, n - 1
    if not loop:
        act = smooth(activity(M), 5); thr = 0.12 * act.max()
        on = np.nonzero(act > thr)[0]; a0 = max(0, on[0] - 4); a1 = min(n - 1, on[-1] + 4)
    # ---- vòng lặp: chọn khung cuối khớp khung đầu nhất (mặt nạ chồng khít sau khi đặt mốc)
    def nm(i):
        m = M[i]; sx = int(round(ax[i] - ax[0])); return np.roll(m, -sx, axis=1)
    if loop:
        best = None
        for s in range(0, 24):
            for e in range(n - 40, n):
                if e - s < 72: continue
                A_, B_ = nm(s), nm(e); iou = (A_ & B_).sum() / max(1, (A_ | B_).sum())
                if not best or iou > best[0]: best = (iou, s, e)
        print(clip, "loop iou", round(best[0], 3), best[1:]); a0, a1 = best[1], best[2] - 1
    if loop:      # nối vòng mượt: 10 khung cuối biến hình dần (trường khoảng cách có dấu) sang 10 khung ngay trước khung đầu → hết giật ở chỗ nối
        def sdf(m): m = m.astype(np.uint8); return cv2.distanceTransform(1 - m, cv2.DIST_L2, 3) - cv2.distanceTransform(m, cv2.DIST_L2, 3)
        NB = 10
        for q in range(NB):
            i = a1 - NB + 1 + q; j = a0 - NB + q
            if j < 0: continue
            w = (q + 1) / (NB + 1); sh = int(round(ax[j] - ax[i]))
            mj = np.roll(M[j], -sh, axis=1); gj = np.roll(G[j], -sh, axis=1)
            M[i] = ((1 - w) * sdf(M[i]) + w * sdf(mj) < 0).astype(np.uint8)
            G[i] = (G[i] if w < 0.5 else gj) & M[i]
    F = []; eyesN = 0; faces = []
    for i in range(a0, a1 + 1):
        m = M[i]; em, eye, right = eyes_of(m, G[i], None); faces.append(right)
        T = (lambda x, y, i=i: ((x - ax[i]) * k, (y - gy) * k))
        ps = polys_of(m, em, G[i], T)
        ys, xs = np.nonzero(m)
        e = [int(round((eye[0] - ax[i]) * k)), int(round((eye[1] - gy) * k))] if eye else None; eyesN += e is not None
        F.append([int(round((xs.max() - xs.min()) * k)), int(round((ys.max() - ys.min()) * k)), e, ps])
    last = a1
    dx = float((tor[last][0] - ax[last]) * k) if not loop else 0.0
    # tốc độ chân (đơn vị / khung): chân chạm đất trôi ngược chiều đi với đúng tốc độ mèo (máy quay bám theo mèo)
    upf = None
    if clip in ("walk", "run"):
        v = []
        for i in range(a0 + 1, a1 + 1):
            def paws(j):
                m = M[j][int(gy) - 10:int(gy) + 3, :]; n2, lab, st, cen = cv2.connectedComponentsWithStats(m.astype(np.uint8), 8)
                return [cen[q][0] - ax[j] for q in range(1, n2) if st[q, 4] > 30]
            p0, p1 = paws(i - 1), paws(i)
            for x1 in p1:
                if not p0: break
                x0 = min(p0, key=lambda z: abs(z - x1));
                if -25 < x1 - x0 < -1: v.append(x0 - x1)
        upf = float(np.median(v) * k) if v else None
        print(clip, "paw samples", len(v), "upf", upf)
    tx = [round(float((tor[i][0] - ax[i]) * k), 1) for i in range(a0, a1 + 1)]      # tâm thân từng khung (đơn vị) – clip chuyển dáng cắt giữa chừng vẫn biết mèo đã dời bao nhiêu
    js = {"n": len(F), "loop": loop, "fps": 24, "dx": round(dx, 1), "upf": round(upf, 3) if upf else None, "tx": tx, "f": F}
    s = json.dumps(js, separators=(",", ":"))
    open(f"{OUT}/{clip}.json", "w").write(s)
    meta[clip] = {"frames": len(F), "a0": a0, "a1": a1, "k": k, "dx": round(dx, 1), "upf": upf, "eyes": eyesN, "faceR_start": faces[0], "faceR_end": faces[-1], "kb": round(len(s) / 1024)}
    print(clip, meta[clip])
json.dump(meta, open(f"{OUT}/meta.json", "w"), indent=1, default=lambda o: o.item() if hasattr(o, "item") else str(o))
