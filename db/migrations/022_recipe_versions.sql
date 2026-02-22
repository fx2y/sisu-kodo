CREATE TABLE IF NOT EXISTS app.recipe_versions (
  id TEXT NOT NULL,
  v TEXT NOT NULL,
  hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'candidate', 'stable')),
  json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, v),
  UNIQUE (id, hash)
);

ALTER TABLE app.recipes
ADD COLUMN IF NOT EXISTS active_v TEXT;

INSERT INTO app.recipe_versions (id, v, hash, status, json)
SELECT
  r.id,
  r.version::text AS v,
  md5(COALESCE(r.spec::text, '{}'::text)) AS hash,
  'stable' AS status,
  jsonb_build_object(
    'id', r.id,
    'v', r.version::text,
    'name', r.name,
    'tags', jsonb_build_array('legacy'),
    'formSchema', jsonb_build_object('type', 'object', 'properties', jsonb_build_object(), 'required', jsonb_build_array()),
    'intentTmpl', COALESCE(r.spec, '{}'::jsonb),
    'wfEntry', 'Runner.runIntent',
    'queue', r.queue_name,
    'limits', jsonb_build_object(
      'maxSteps', r.max_steps,
      'maxFanout', r.max_concurrency,
      'maxSbxMin', r.max_sandbox_minutes,
      'maxTokens', 8000
    ),
    'eval', jsonb_build_array(),
    'fixtures', jsonb_build_array(),
    'prompts', jsonb_build_object('compile', 'legacy compile', 'postmortem', 'legacy postmortem')
  ) AS json
FROM app.recipes r
ON CONFLICT (id, v) DO NOTHING;

UPDATE app.recipes
SET active_v = version::text
WHERE active_v IS NULL;
