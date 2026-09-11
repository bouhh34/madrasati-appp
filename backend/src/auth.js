import { pool } from "./db.js";
import {
  tokenHash,
  randomToken
} from "./security.js";

export const COOKIE_NAME = "mm_session";

export async function createSession({
  reply,
  userId,
  schoolId,
  userAgent,
  ip
}) {
  const rawToken = randomToken(32);
  const hashedToken = tokenHash(rawToken);

  const csrfToken = randomToken(32);
  const csrfHash = tokenHash(csrfToken);

  const ttlHours = Math.max(
    1,
    Math.min(
      72,
      Number(
        process.env.SESSION_TTL_HOURS || 12
      )
    )
  );

  await pool.query(
    `
    INSERT INTO sessions
    (
      token_hash,
      csrf_hash,
      user_id,
      school_id,
      expires_at,
      user_agent_hash,
      ip_hash
    )
    VALUES
    (
      $1,
      $2,
      $3,
      $4,
      now() + ($5 || ' hours')::interval,
      encode(digest($6,'sha256'),'hex'),
      encode(digest($7,'sha256'),'hex')
    )
    `,
    [
      hashedToken,
      csrfHash,
      userId,
      schoolId,
      String(ttlHours),
      userAgent || "",
      ip || ""
    ]
  );

  reply.setCookie(
    COOKIE_NAME,
    rawToken,
    {
      httpOnly: true,
      secure:
        process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: ttlHours * 60 * 60
    }
  );

  return csrfToken;
}

export async function destroySession(
  request,
  reply
) {
  const rawToken =
    request.cookies?.[COOKIE_NAME];

  if (rawToken) {
    await pool.query(
      `
      DELETE FROM sessions
      WHERE token_hash=$1
      `,
      [
        tokenHash(rawToken)
      ]
    );
  }

  reply.clearCookie(
    COOKIE_NAME,
    {
      path: "/"
    }
  );
}

export async function loadSession(
  request
) {
  const rawToken =
    request.cookies?.[COOKIE_NAME];

  if (!rawToken) {
    return null;
  }

  const { rows } =
    await pool.query(
      `
      SELECT
        s.id AS session_id,
        s.csrf_hash,
        s.user_id,
        s.school_id,
        s.expires_at,

        u.full_name,
        u.login,

        m.role,
        m.active

      FROM sessions s

      JOIN users u
        ON u.id=s.user_id

      JOIN memberships m
        ON m.user_id=s.user_id
        AND m.school_id=s.school_id

      WHERE
        s.token_hash=$1
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
        AND u.disabled_at IS NULL

      LIMIT 1
      `,
      [
        tokenHash(rawToken)
      ]
    );

  const session = rows[0];

  if (
    !session ||
    !session.active
  ) {
    return null;
  }

  return session;
}
