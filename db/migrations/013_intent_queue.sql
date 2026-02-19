ALTER TABLE app.recipes DROP CONSTRAINT recipes_queue_name_check;
ALTER TABLE app.recipes ADD CONSTRAINT recipes_queue_name_check CHECK (queue_name IN ('compileQ', 'sbxQ', 'controlQ', 'intentQ'));

UPDATE app.recipes SET queue_name = 'intentQ' WHERE name IN ('compile-default', 'sandbox-default', 'control-default');
