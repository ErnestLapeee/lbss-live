ALTER TABLE "game_events" ADD COLUMN IF NOT EXISTS "runner_scored_reasons" jsonb DEFAULT '[]';
