"""
Byte-compatible port of src/lib/server/crypto.ts.

Must produce/consume the exact same on-disk formats as the Node app so this
service can decrypt BigQuery credentials and verify passwords the Node app
already wrote — this is NOT a fresh crypto scheme, it's a reimplementation
of the existing one.

  - encrypt/decrypt: AES-256-GCM, 12-byte random IV,
    payload format "{iv_hex}.{tag_hex}.{ciphertext_hex}"
  - hash_password/verify_password: scrypt(N=16384, r=8, p=1, dklen=64),
    16-byte random salt, format "{salt_hex}.{hash_hex}"
  - hash_api_key: plain SHA-256 hex digest
  - gen_id: "{prefix}-{epoch_ms}-{6 hex chars}"

Key resolution mirrors crypto.ts exactly, EXCEPT this service never
generates a new secret.key file — key creation is the Node app's
responsibility; if neither the env var nor the file exist, that's a
configuration error here, not a fresh-install case.
"""

import hashlib
import hmac
import os
import secrets
import time
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.db import DATA_DIR

SECRET_FILE = DATA_DIR / "secret.key"

_cached_key: bytes | None = None

# Node's crypto.scryptSync defaults: N=16384, r=8, p=1. maxmem is set well
# above the ~16MB scrypt needs at these params to avoid Python's "memory
# limit exceeded" error at the default threshold.
_SCRYPT_N = 16384
_SCRYPT_R = 8
_SCRYPT_P = 1
_SCRYPT_MAXMEM = 128 * _SCRYPT_N * _SCRYPT_R * 2


def get_secret_key() -> bytes:
    global _cached_key
    if _cached_key is not None:
        return _cached_key

    env_key = os.environ.get("CROSSTECCH_SECRET_KEY", "").strip()
    if env_key:
        key = bytes.fromhex(env_key)
        if len(key) != 32:
            raise ValueError(
                f"CROSSTECCH_SECRET_KEY must be a 64-character hex string (32 bytes). Got {len(key)} bytes."
            )
        _cached_key = key
        return _cached_key

    if not SECRET_FILE.exists():
        raise FileNotFoundError(
            f"No secret key found at {SECRET_FILE} and CROSSTECCH_SECRET_KEY is unset. "
            "This backend does not generate keys — run the Next.js app at least once first, "
            "or set CROSSTECCH_SECRET_KEY to match it."
        )
    _cached_key = bytes.fromhex(SECRET_FILE.read_text().strip())
    return _cached_key


# ── AES-256-GCM ──────────────────────────────────────────────────────────────


def encrypt(plain: str) -> str:
    key = get_secret_key()
    iv = secrets.token_bytes(12)
    aesgcm = AESGCM(key)
    enc = aesgcm.encrypt(iv, plain.encode("utf-8"), None)  # ciphertext || 16-byte tag
    ciphertext, tag = enc[:-16], enc[-16:]
    return f"{iv.hex()}.{tag.hex()}.{ciphertext.hex()}"


def decrypt(payload: str) -> str:
    key = get_secret_key()
    iv_h, tag_h, data_h = payload.split(".")
    iv = bytes.fromhex(iv_h)
    tag = bytes.fromhex(tag_h)
    ciphertext = bytes.fromhex(data_h)
    aesgcm = AESGCM(key)
    plain = aesgcm.decrypt(iv, ciphertext + tag, None)
    return plain.decode("utf-8")


# ── Password hashing (scrypt) ────────────────────────────────────────────────


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    h = hashlib.scrypt(
        password.encode("utf-8"), salt=salt,
        n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P, maxmem=_SCRYPT_MAXMEM, dklen=64,
    )
    return f"{salt.hex()}.{h.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt_h, hash_h = stored.split(".")
    except ValueError:
        return False
    salt = bytes.fromhex(salt_h)
    expected = bytes.fromhex(hash_h)
    h = hashlib.scrypt(
        password.encode("utf-8"), salt=salt,
        n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P, maxmem=_SCRYPT_MAXMEM, dklen=64,
    )
    return hmac.compare_digest(h, expected)


def random_token() -> str:
    return secrets.token_hex(32)


# ── API key hashing (SHA-256) ────────────────────────────────────────────────


def hash_api_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


def gen_id(prefix: str) -> str:
    return f"{prefix}-{int(time.time() * 1000)}-{secrets.token_hex(3)}"
