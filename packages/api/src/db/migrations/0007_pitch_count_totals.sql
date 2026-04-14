ALTER TABLE player_game_pitching
  ADD COLUMN IF NOT EXISTS balls integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS strikes integer DEFAULT 0;

ALTER TABLE player_season_pitching
  ADD COLUMN IF NOT EXISTS balls integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS strikes integer DEFAULT 0;
