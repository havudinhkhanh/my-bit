# vẽ thử khung vector (như canvas của mascot.js) → ảnh lưới để soát
import json, sys, numpy as np, cv2
D = sys.argv[1]; clip = sys.argv[2]; step = int(sys.argv[3]) if len(sys.argv) > 3 else 12
d = json.load(open(f"{D}/{clip}.json")); F = d["f"]
def dec(a):
    t = a[0]; pts = []; x = y = 0
    for i in range(1, len(a), 2):
        if i == 1: x, y = a[1], a[2]
        else: x += a[i]; y += a[i + 1]
        pts.append((x, y))
    return t, np.array(pts, float)
S = 0.9; W, H = int(420 * S), int(290 * S)
tiles = []
for fi in range(0, len(F), step):
    w, h, eye, ps = F[fi]
    im = np.full((H, W, 3), 245, np.uint8)
    cv2.line(im, (0, int(262 * S)), (W, int(262 * S)), (210, 210, 210), 1)
    cv2.line(im, (int(200 * S), 0), (int(200 * S), H), (225, 225, 225), 1)
    body = np.zeros((H, W), np.uint8); hole = np.zeros((H, W), np.uint8)
    for a in ps:
        t, p = dec(a); q = ((p + [200, 262]) * S * 8).astype(np.int32)
        if t == 0: cv2.fillPoly(body, [q], 1, cv2.LINE_AA, shift=3)
        elif t == 1: cv2.fillPoly(hole, [q], 1, cv2.LINE_AA, shift=3)
    m = body & (1 - hole); im[m > 0] = (12, 12, 12)
    for a in ps:
        t, p = dec(a)
        if t == 2: cv2.fillPoly(im, [((p + [200, 262]) * S * 8).astype(np.int32)], (100, 160, 200), cv2.LINE_AA, shift=3)
    if eye: cv2.circle(im, (int((eye[0] + 200) * S), int((eye[1] + 262) * S)), 3, (0, 0, 255), -1)
    cv2.putText(im, str(fi), (4, 14), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (90, 90, 90), 1)
    tiles.append(im)
cols = 8; rows = (len(tiles) + cols - 1) // cols
G = np.full((rows * H, cols * W, 3), 255, np.uint8)
for i, t in enumerate(tiles): r, c = divmod(i, cols); G[r * H:(r + 1) * H, c * W:(c + 1) * W] = t
cv2.imwrite(f"{D}/pv_{clip}.png", G); print(len(F), "frames", G.shape)
