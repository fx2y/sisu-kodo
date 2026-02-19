DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='app' AND table_name='run_steps' AND column_name='span_id') THEN
    ALTER TABLE app.run_steps ADD COLUMN span_id TEXT;
  END IF;
END $$;
