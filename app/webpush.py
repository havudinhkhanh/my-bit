"""Gửi Web Push (RFC 8291 mã hoá aes128gcm + RFC 8292 VAPID) chỉ bằng thư viện cryptography."""
from __future__ import annotations

import base64
import json
import os
import time
from urllib.parse import urlparse

import requests
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF


def b64d(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def b64e(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _hkdf(salt: bytes, ikm: bytes, info: bytes, n: int) -> bytes:
    return HKDF(algorithm=hashes.SHA256(), length=n, salt=salt, info=info).derive(ikm)


def encrypt(payload: bytes, p256dh: str, auth: str, salt: bytes | None = None, as_priv=None) -> bytes:
    ua_pub = b64d(p256dh)
    secret = b64d(auth)
    as_priv = as_priv or ec.generate_private_key(ec.SECP256R1())
    as_pub = as_priv.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    shared = as_priv.exchange(ec.ECDH(), ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), ua_pub))
    ikm = _hkdf(secret, shared, b"WebPush: info\x00" + ua_pub + as_pub, 32)
    salt = salt or os.urandom(16)
    cek = _hkdf(salt, ikm, b"Content-Encoding: aes128gcm\x00", 16)
    nonce = _hkdf(salt, ikm, b"Content-Encoding: nonce\x00", 12)
    ct = AESGCM(cek).encrypt(nonce, payload + b"\x02", None)
    return salt + (4096).to_bytes(4, "big") + bytes([len(as_pub)]) + as_pub + ct


def vapid_key_from_jwk(jwk: dict):
    n = int.from_bytes(b64d(jwk["d"]), "big")
    return ec.derive_private_key(n, ec.SECP256R1())


def vapid_header(key, endpoint: str, sub: str) -> str:
    u = urlparse(endpoint)
    head = b64e(json.dumps({"typ": "JWT", "alg": "ES256"}, separators=(",", ":")).encode())
    body = b64e(json.dumps({"aud": f"{u.scheme}://{u.netloc}", "exp": int(time.time()) + 12 * 3600, "sub": sub}, separators=(",", ":")).encode())
    der = key.sign(f"{head}.{body}".encode(), ec.ECDSA(hashes.SHA256()))
    r, s = decode_dss_signature(der)
    sig = b64e(r.to_bytes(32, "big") + s.to_bytes(32, "big"))
    pub = key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    return f"vapid t={head}.{body}.{sig}, k={b64e(pub)}"


def send(sub: dict, data: dict, key, subject: str, ttl: int = 43200, timeout: int = 20) -> int:
    """Trả về mã HTTP của dịch vụ đẩy (201 = đã nhận; 404/410 = đăng ký hết hiệu lực)."""
    body = encrypt(json.dumps(data, ensure_ascii=False).encode("utf-8"), sub["keys"]["p256dh"], sub["keys"]["auth"])
    r = requests.post(sub["endpoint"], data=body, timeout=timeout, headers={
        "Authorization": vapid_header(key, sub["endpoint"], subject), "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream", "TTL": str(ttl), "Urgency": "normal"})
    return r.status_code
