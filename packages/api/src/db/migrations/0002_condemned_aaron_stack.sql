CREATE TABLE "player_game_fielding" (
	"id" serial PRIMARY KEY NOT NULL,
	"game_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"team_id" integer NOT NULL,
	"position" integer,
	"innings" numeric(4, 1) DEFAULT '0',
	"putouts" integer DEFAULT 0,
	"assists" integer DEFAULT 0,
	"errors" integer DEFAULT 0,
	"double_plays" integer DEFAULT 0,
	"triple_plays" integer DEFAULT 0,
	"passed_balls" integer DEFAULT 0,
	"catcher_stolen_bases" integer DEFAULT 0,
	"catcher_caught_stealing" integer DEFAULT 0,
	"pickoffs" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "player_season_fielding" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"team_id" integer NOT NULL,
	"season_id" integer NOT NULL,
	"games" integer DEFAULT 0,
	"innings" numeric(5, 1) DEFAULT '0',
	"putouts" integer DEFAULT 0,
	"assists" integer DEFAULT 0,
	"errors" integer DEFAULT 0,
	"double_plays" integer DEFAULT 0,
	"triple_plays" integer DEFAULT 0,
	"passed_balls" integer DEFAULT 0,
	"catcher_stolen_bases" integer DEFAULT 0,
	"catcher_caught_stealing" integer DEFAULT 0,
	"pickoffs" integer DEFAULT 0,
	"fielding_pct" numeric(4, 3),
	"last_computed_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "game_lineups" (
	"id" serial PRIMARY KEY NOT NULL,
	"game_id" integer NOT NULL,
	"team_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"batting_order" integer NOT NULL,
	"position" integer NOT NULL,
	"entered_inning" integer DEFAULT 1,
	"entered_half" varchar(3) DEFAULT 'top',
	"is_starter" boolean DEFAULT true,
	"is_active" boolean DEFAULT true
);
--> statement-breakpoint
ALTER TABLE "game_events" ADD COLUMN "fielding_sequence" varchar(30);--> statement-breakpoint
ALTER TABLE "game_events" ADD COLUMN "putout_fielder_ids" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "game_events" ADD COLUMN "assist_fielder_ids" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "game_events" ADD COLUMN "error_fielder_ids" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "game_events" ADD COLUMN "pitch_count" integer;--> statement-breakpoint
ALTER TABLE "game_events" ADD COLUMN "pitch_sequence" varchar(50);--> statement-breakpoint
ALTER TABLE "player_game_fielding" ADD CONSTRAINT "player_game_fielding_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_game_fielding" ADD CONSTRAINT "player_game_fielding_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_game_fielding" ADD CONSTRAINT "player_game_fielding_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_season_fielding" ADD CONSTRAINT "player_season_fielding_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_season_fielding" ADD CONSTRAINT "player_season_fielding_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_season_fielding" ADD CONSTRAINT "player_season_fielding_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_lineups" ADD CONSTRAINT "game_lineups_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_lineups" ADD CONSTRAINT "game_lineups_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_lineups" ADD CONSTRAINT "game_lineups_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "player_game_fielding_game_player_unique" ON "player_game_fielding" USING btree ("game_id","player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "player_season_fielding_player_team_season_unique" ON "player_season_fielding" USING btree ("player_id","team_id","season_id");--> statement-breakpoint
CREATE INDEX "game_lineups_game_id_idx" ON "game_lineups" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "game_lineups_game_id_team_id_idx" ON "game_lineups" USING btree ("game_id","team_id");