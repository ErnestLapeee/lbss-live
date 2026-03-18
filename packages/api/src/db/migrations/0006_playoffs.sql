-- Playoffs system (manual, season-configurable)

ALTER TABLE "seasons"
  ADD COLUMN IF NOT EXISTS "has_playoffs" boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS "regular_season_games_per_team" integer,
  ADD COLUMN IF NOT EXISTS "playoff_settings" jsonb DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS "playoffs" (
  "id" serial PRIMARY KEY,
  "season_id" integer NOT NULL REFERENCES "seasons"("id") ON DELETE CASCADE,
  "name" varchar(120) NOT NULL,
  "is_active" boolean DEFAULT true,
  "config" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "playoffs_season_id_idx" ON "playoffs"("season_id");
CREATE INDEX IF NOT EXISTS "playoffs_active_idx" ON "playoffs"("is_active");

CREATE TABLE IF NOT EXISTS "playoff_series" (
  "id" serial PRIMARY KEY,
  "playoffs_id" integer NOT NULL REFERENCES "playoffs"("id") ON DELETE CASCADE,
  "round_number" integer NOT NULL,
  "series_index" integer NOT NULL,
  "label" varchar(120),
  "higher_seed" integer,
  "lower_seed" integer,
  "higher_team_id" integer REFERENCES "teams"("id"),
  "lower_team_id" integer REFERENCES "teams"("id"),
  "best_of" integer NOT NULL DEFAULT 1,
  "winner_team_id" integer REFERENCES "teams"("id"),
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "playoff_series_playoffs_id_idx" ON "playoff_series"("playoffs_id");
CREATE INDEX IF NOT EXISTS "playoff_series_round_idx" ON "playoff_series"("playoffs_id", "round_number");

ALTER TABLE "games"
  ADD COLUMN IF NOT EXISTS "playoff_series_id" integer REFERENCES "playoff_series"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "games_playoff_series_id_idx" ON "games"("playoff_series_id");

