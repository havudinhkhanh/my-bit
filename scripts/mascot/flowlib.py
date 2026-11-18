# nội suy khung giữa bằng luồng quang học (DIS) trên video gốc + làm mượt mép theo thời gian có bù chuyển động
import cv2, numpy as np, os
def load(src, clip):
    fs = sorted(os.listdir(f"{src}/{clip}")); return [cv2.imread(f"{src}/{clip}/{f}") for f in fs]
def soft(im):
    L = cv2.GaussianBlur(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY).astype(np.float32), (0, 0), 1.2); return np.clip((175 - L) / 90.0, 0, 1)
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
    inv = (1 - m).astype(np.uint8); n, lab, st, _ = cv2.connectedComponentsWithStats(inv, 4); out = m.copy()
    for i in range(1, n):
        x, y, w, h, a = st[i]
        if a < amax and x > 0 and y > 0 and x + w < m.shape[1] and y + h < m.shape[0]: out[lab == i] = 1
    return out
def clean(m):
    m = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)); return fill_small(biggest(m), 900)
def sdf(m):
    m = m.astype(np.uint8); return cv2.distanceTransform(1 - m, cv2.DIST_L2, 3) - cv2.distanceTransform(m, cv2.DIST_L2, 3)
class Flow:
    def __init__(self, ims):
        self.n = len(ims); H, W = ims[0].shape[:2]; self.H, self.W = H, W
        sm = [cv2.resize(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY), (W // 2, H // 2), interpolation=cv2.INTER_AREA) for im in ims]
        dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
        self.FW = [dis.calc(sm[i], sm[i + 1], None) for i in range(self.n - 1)]      # luồng khung i → i+1 (nửa độ phân giải)
        self.BW = [dis.calc(sm[i + 1], sm[i], None) for i in range(self.n - 1)]      # luồng khung i+1 → i
        self.gx, self.gy = np.meshgrid(np.arange(W, dtype=np.float32), np.arange(H, dtype=np.float32))
    def warp(self, X, fl, s):      # lấy mẫu X tại x + s·luồng (luồng phóng lên đủ độ phân giải)
        f = cv2.resize(fl, (self.W, self.H), interpolation=cv2.INTER_LINEAR) * 2.0 * s
        return cv2.remap(X, self.gx + f[..., 0], self.gy + f[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
def build(ims):
    """→ khung chính đã làm mượt mép theo thời gian (bù chuyển động 1-2-1) + khung giữa (i+½) nội suy theo luồng; mỗi khung (mặt nạ thân, mặt nạ vàng)"""
    n = len(ims); S = []; G0 = []
    for im in ims: S.append(((soft(im) > 0.5) | (goldmask(im) > 0)).astype(np.uint8)); G0.append(goldmask(im))
    R = [clean(m) for m in S]; del S
    fl = Flow(ims); D = [sdf(m) for m in R]; Gf = G0
    K, KG, Mi, MG = [], [], [], []
    for i in range(n):
        acc = 2 * D[i]; gacc = 2 * Gf[i].astype(np.float32); w = 2
        if i > 0: acc = acc + fl.warp(D[i - 1], fl.BW[i - 1], 1.0); gacc = gacc + fl.warp(Gf[i - 1].astype(np.float32), fl.BW[i - 1], 1.0); w += 1
        if i < n - 1: acc = acc + fl.warp(D[i + 1], fl.FW[i], 1.0); gacc = gacc + fl.warp(Gf[i + 1].astype(np.float32), fl.FW[i], 1.0); w += 1
        m = clean(acc / w < 0); K.append(m); KG.append(((gacc / w) >= 0.5).astype(np.uint8) & m)
    for i in range(n - 1):
        a = fl.warp(D[i], fl.BW[i], 0.5); b = fl.warp(D[i + 1], fl.FW[i], 0.5)
        m = clean((a + b) / 2 < 0); Mi.append(m)
        ga = fl.warp(Gf[i].astype(np.float32), fl.BW[i], 0.5); gb = fl.warp(Gf[i + 1].astype(np.float32), fl.FW[i], 0.5); MG.append((((ga + gb) / 2) >= 0.45).astype(np.uint8) & m)
    return K, KG, Mi, MG
