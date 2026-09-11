import crypto from "crypto";
import argon2 from "argon2";

const pepper =
  process.env.PASSWORD_PEPPER || "";

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

export async function hashPassword(password) {
  return argon2.hash(
    String(password) + pepper,
    {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
      hashLength: 32
    }
  );
}

export async function verifyPassword(
  hash,
  password
) {
  try {
    return await argon2.verify(
      hash,
      String(password) + pepper
    );
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
    value.length >= 12 &&
    value.length <= 128 &&
    /[A-Za-z]/.test(value) &&
    /\d/.test(value)
  );
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
