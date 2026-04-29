-- Allow explicit vacant batting-order slots (e.g. ejection): no player and no defensive position on that row.
ALTER TABLE game_lineups ALTER COLUMN player_id DROP NOT NULL;
ALTER TABLE game_lineups ALTER COLUMN position DROP NOT NULL;
