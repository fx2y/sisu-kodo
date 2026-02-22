CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE app.intents ADD COLUMN IF NOT EXISTS intent_hash TEXT;
ALTER TABLE app.intents ADD COLUMN IF NOT EXISTS recipe_id TEXT;
ALTER TABLE app.intents ADD COLUMN IF NOT EXISTS recipe_v TEXT;
ALTER TABLE app.intents ADD COLUMN IF NOT EXISTS recipe_hash TEXT;
ALTER TABLE app.intents ADD COLUMN IF NOT EXISTS json JSONB;

UPDATE app.intents
SET json = jsonb_build_object(
      'goal', goal,
      'inputs', COALESCE(payload->'inputs', '{}'::jsonb),
      'constraints', COALESCE(payload->'constraints', '{}'::jsonb),
      'connectors', payload->'connectors'
    )
WHERE json IS NULL;

WITH computed AS (
  SELECT
    i.id,
    encode(digest(COALESCE(i.json::text, '{}'::text), 'sha256'), 'hex') AS computed_hash,
    i.created_at
  FROM app.intents i
),
ranked AS (
  SELECT
    c.id,
    c.computed_hash,
    ROW_NUMBER() OVER (PARTITION BY c.computed_hash ORDER BY c.created_at ASC, c.id ASC) AS rn
  FROM computed c
)
UPDATE app.intents i
SET intent_hash = CASE WHEN r.rn = 1 THEN r.computed_hash ELSE NULL END
FROM ranked r
WHERE i.id = r.id;

CREATE UNIQUE INDEX IF NOT EXISTS intents_intent_hash_uq
  ON app.intents(intent_hash)
  WHERE intent_hash IS NOT NULL;

ALTER TABLE app.runs ADD COLUMN IF NOT EXISTS intent_hash TEXT;
ALTER TABLE app.runs ADD COLUMN IF NOT EXISTS recipe_id TEXT;
ALTER TABLE app.runs ADD COLUMN IF NOT EXISTS recipe_v TEXT;
ALTER TABLE app.runs ADD COLUMN IF NOT EXISTS recipe_hash TEXT;

UPDATE app.runs r
SET intent_hash = i.intent_hash,
    recipe_id = i.recipe_id,
    recipe_v = i.recipe_v,
    recipe_hash = i.recipe_hash
FROM app.intents i
WHERE r.intent_id = i.id
  AND r.intent_hash IS NULL;

CREATE INDEX IF NOT EXISTS runs_intent_hash_idx ON app.runs(intent_hash);
