-- Faster play-by-play and linescore queries: game + active rows + event order
CREATE INDEX IF NOT EXISTS "game_events_game_active_number_idx" ON "game_events" ("game_id", "is_deleted", "event_number");
