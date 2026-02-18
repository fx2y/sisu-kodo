-- Fix intentQ in recipes check constraint
ALTER TABLE app.recipes DROP CONSTRAINT IF EXISTS recipes_queue_name_check;
ALTER TABLE app.recipes ADD CONSTRAINT recipes_queue_name_check CHECK (queue_name IN ('compileQ', 'sandboxQ', 'controlQ', 'intentQ'));

-- Update default recipe to use intentQ
UPDATE app.recipes SET queue_name = 'intentQ' WHERE name = 'compile-default' AND version = 1;
