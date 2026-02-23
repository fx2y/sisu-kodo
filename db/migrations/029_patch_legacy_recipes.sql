-- Patch legacy recipes to satisfy the required Intent schema (goal, inputs, constraints)
UPDATE app.recipe_versions
SET json = jsonb_set(
  jsonb_set(
    jsonb_set(
      json,
      '{intentTmpl}',
      jsonb_build_object(
        'goal', 'Legacy execution: ' || (json->>'name'),
        'inputs', jsonb_build_object('legacy_spec', json->'intentTmpl'),
        'constraints', jsonb_build_object('stepLibrary', jsonb_build_object('primitives', jsonb_build_array('Legacy')))
      )
    ),
    '{formSchema}',
    '{"type": "object", "properties": {}, "required": []}'::jsonb
  ),
  '{tags}',
  '["legacy", "patched"]'::jsonb
)
WHERE json->'tags' @> '["legacy"]'::jsonb;
