-- Phase 2: Batting and Pitching Basic/Advanced columns (iScore parity)
ALTER TABLE "player_game_batting" ADD COLUMN "bunt_singles" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_game_batting" ADD COLUMN "strikeouts_looking" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_game_batting" ADD COLUMN "strikeouts_swinging" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_game_batting" ADD COLUMN "picked_off" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_game_batting" ADD COLUMN "fielders_choice" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_game_batting" ADD COLUMN "catcher_interference" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_game_batting" ADD COLUMN "grounded_into_triple_play" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_season_batting" ADD COLUMN "bunt_singles" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_season_batting" ADD COLUMN "strikeouts_looking" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_season_batting" ADD COLUMN "strikeouts_swinging" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_season_batting" ADD COLUMN "picked_off" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_season_batting" ADD COLUMN "fielders_choice" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_season_batting" ADD COLUMN "catcher_interference" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_season_batting" ADD COLUMN "grounded_into_triple_play" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_game_pitching" ADD COLUMN "holds" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_game_pitching" ADD COLUMN "save_opportunities" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_game_pitching" ADD COLUMN "blown_saves" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_game_pitching" ADD COLUMN "complete_games" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_game_pitching" ADD COLUMN "game_score" integer;--> statement-breakpoint
ALTER TABLE "player_game_pitching" ADD COLUMN "quality_starts" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_game_pitching" ADD COLUMN "shutouts" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_game_pitching" ADD COLUMN "inherited_runners" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_game_pitching" ADD COLUMN "inherited_runners_scored" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_game_pitching" ADD COLUMN "strikeouts_looking" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_game_pitching" ADD COLUMN "strikeouts_swinging" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_season_pitching" ADD COLUMN "holds" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_season_pitching" ADD COLUMN "save_opportunities" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_season_pitching" ADD COLUMN "blown_saves" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_season_pitching" ADD COLUMN "complete_games" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_season_pitching" ADD COLUMN "game_score" integer;--> statement-breakpoint
ALTER TABLE "player_season_pitching" ADD COLUMN "quality_starts" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_season_pitching" ADD COLUMN "shutouts" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_season_pitching" ADD COLUMN "inherited_runners" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_season_pitching" ADD COLUMN "inherited_runners_scored" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_season_pitching" ADD COLUMN "strikeouts_looking" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_season_pitching" ADD COLUMN "strikeouts_swinging" integer DEFAULT 0;
