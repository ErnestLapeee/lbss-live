ALTER TABLE "game_lineups" ADD COLUMN IF NOT EXISTS "exited_inning" integer;
ALTER TABLE "game_lineups" ADD COLUMN IF NOT EXISTS "exited_half" varchar(3);
