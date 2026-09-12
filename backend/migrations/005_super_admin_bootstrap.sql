/* Ma Madrassa - One-time SUPER ADMIN bootstrap */

CREATE TABLE IF NOT EXISTS platform_bootstrap_state (
  singleton boolean PRIMARY KEY DEFAULT true
    CHECK (singleton = true),

  consumed boolean NOT NULL DEFAULT false,

  consumed_by uuid
    REFERENCES users(id) ON DELETE SET NULL,

  consumed_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO platform_bootstrap_state (
  singleton,
  consumed
)
VALUES (
  true,
  false
)
ON CONFLICT (singleton) DO NOTHING;
