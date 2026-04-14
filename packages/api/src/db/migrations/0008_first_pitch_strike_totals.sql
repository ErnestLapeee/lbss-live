ALTER TABLE player_game_pitching
  ADD COLUMN IF NOT EXISTS first_pitch_strikes integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_pitch_total integer DEFAULT 0;

ALTER TABLE player_season_pitching
  ADD COLUMN IF NOT EXISTS first_pitch_strikes integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_pitch_total integer DEFAULT 0;
