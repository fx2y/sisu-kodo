WITH ranked AS (
  SELECT
    id,
    intent_hash,
    ROW_NUMBER() OVER (PARTITION BY intent_hash ORDER BY created_at ASC, id ASC) AS rn
  FROM app.intents
  WHERE intent_hash IS NOT NULL
)
UPDATE app.intents i
SET intent_hash = NULL
FROM ranked r
WHERE i.id = r.id
  AND r.rn > 1;
