/* Ma Madrassa - Platform SUPER ADMIN */

CREATE TABLE IF NOT EXISTS platform_admins (
  user_id uuid PRIMARY KEY
    REFERENCES users(id) ON DELETE CASCADE,

  role text NOT NULL DEFAULT 'SUPER_ADMIN'
    CHECK (role = 'SUPER_ADMIN'),

  active boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_admins_active
ON platform_admins(active);
