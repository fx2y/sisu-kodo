CREATE TABLE IF NOT EXISTS app.recipes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version INT NOT NULL CHECK (version > 0),
  queue_name TEXT NOT NULL CHECK (queue_name IN ('compileQ', 'sbxQ', 'controlQ')),
  max_concurrency INT NOT NULL CHECK (max_concurrency > 0),
  max_steps INT NOT NULL CHECK (max_steps > 0),
  max_sandbox_minutes INT NOT NULL CHECK (max_sandbox_minutes > 0),
  spec JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (name, version)
);

INSERT INTO app.recipes (
  id,
  name,
  version,
  queue_name,
  max_concurrency,
  max_steps,
  max_sandbox_minutes,
  spec
)
VALUES
  (
    'rcp_compile_default_v1',
    'compile-default',
    1,
    'compileQ',
    10,
    32,
    15,
    '{"class":"compile","notes":"default compile lane"}'::jsonb
  ),
  (
    'rcp_sandbox_default_v1',
    'sandbox-default',
    1,
    'sbxQ',
    20,
    128,
    60,
    '{"class":"sandbox","notes":"parallel sandbox lane"}'::jsonb
  ),
  (
    'rcp_control_default_v1',
    'control-default',
    1,
    'controlQ',
    5,
    16,
    10,
    '{"class":"control","notes":"events/retries lane"}'::jsonb
  )
ON CONFLICT (id) DO NOTHING;
