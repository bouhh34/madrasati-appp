import crypto from "crypto";
import argon2 from "argon2";

export async function hashPassword(password) {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 3,
    parallelism: 1
  });
}

export async function verifyPassword(hash, password) {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export function normalizeLogin(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFKC");
}

export function strongPassword(password) {
  const value = String(password || "");

  return (
    value.length >= 10 &&
    value.length <= 128 &&
    /[A-Za-z]/.test(value) &&
    /\d/.test(value)
  );
}

export function randomToken(bytes = 32) {
  return crypto
    .randomBytes(bytes)
    .toString("base64url");
}

export function tokenHash(token) {
  return crypto
    .createHash("sha256")
    .update(String(token || ""), "utf8")
    .digest("hex");
}

export function safeEqualText(a, b) {
  const first = Buffer.from(
    String(a || ""),
    "utf8"
  );

  const second = Buffer.from(
    String(b || ""),
    "utf8"
  );

  if (first.length !== second.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    first,
    second
  );
}

export function isMutation(method) {
  return [
    "POST",
    "PUT",
    "PATCH",
    "DELETE"
  ].includes(
    String(method || "").toUpperCase()
  );
  }
