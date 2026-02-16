ALTER TABLE "game_events" ADD COLUMN "hit_location_x" numeric(5, 1);--> statement-breakpoint
ALTER TABLE "game_events" ADD COLUMN "hit_location_y" numeric(5, 1);--> statement-breakpoint
ALTER TABLE "game_events" ADD COLUMN "hit_type" varchar(15);--> statement-breakpoint
ALTER TABLE "game_events" ADD COLUMN "hit_hardness" varchar(10);--> statement-breakpoint
ALTER TABLE "player_game_batting" ADD COLUMN "ground_outs" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_game_batting" ADD COLUMN "fly_outs" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_game_batting" ADD COLUMN "grounded_into_double_plays" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_game_batting" ADD COLUMN "intentional_walks" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_game_batting" ADD COLUMN "reached_on_error" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_game_batting" ADD COLUMN "total_bases" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_game_pitching" ADD COLUMN "batters_faced" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_game_pitching" ADD COLUMN "balks" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_game_pitching" ADD COLUMN "intentional_walks" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_game_pitching" ADD COLUMN "ground_outs" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_game_pitching" ADD COLUMN "fly_outs" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_season_batting" ADD COLUMN "ground_outs" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_season_batting" ADD COLUMN "fly_outs" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_season_batting" ADD COLUMN "grounded_into_double_plays" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_season_batting" ADD COLUMN "intentional_walks" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_season_batting" ADD COLUMN "reached_on_error" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_season_batting" ADD COLUMN "total_bases" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_season_batting" ADD COLUMN "babip" numeric(4, 3);--> statement-breakpoint
ALTER TABLE "player_season_pitching" ADD COLUMN "batters_faced" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_season_pitching" ADD COLUMN "balks" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_season_pitching" ADD COLUMN "intentional_walks" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_season_pitching" ADD COLUMN "ground_outs" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_season_pitching" ADD COLUMN "fly_outs" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_season_pitching" ADD COLUMN "fip" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "player_season_pitching" ADD COLUMN "k9" numeric(4, 1);--> statement-breakpoint
ALTER TABLE "player_season_pitching" ADD COLUMN "bb9" numeric(4, 1);--> statement-breakpoint
ALTER TABLE "player_season_pitching" ADD COLUMN "h9" numeric(4, 1);--> statement-breakpoint
ALTER TABLE "player_season_pitching" ADD COLUMN "babip" numeric(4, 3);