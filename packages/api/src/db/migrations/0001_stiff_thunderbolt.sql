CREATE TABLE "player_season_pitching" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"team_id" integer NOT NULL,
	"season_id" integer NOT NULL,
	"games" integer DEFAULT 0,
	"games_started" integer DEFAULT 0,
	"wins" integer DEFAULT 0,
	"losses" integer DEFAULT 0,
	"saves" integer DEFAULT 0,
	"innings_pitched" numeric(5, 1) DEFAULT '0',
	"hits_allowed" integer DEFAULT 0,
	"runs_allowed" integer DEFAULT 0,
	"earned_runs" integer DEFAULT 0,
	"walks_allowed" integer DEFAULT 0,
	"strikeouts" integer DEFAULT 0,
	"home_runs_allowed" integer DEFAULT 0,
	"hit_batters" integer DEFAULT 0,
	"wild_pitches" integer DEFAULT 0,
	"era" numeric(5, 2),
	"whip" numeric(4, 2),
	"strikeout_rate" numeric(4, 1),
	"walk_rate" numeric(4, 1),
	"last_computed_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "player_season_pitching" ADD CONSTRAINT "player_season_pitching_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_season_pitching" ADD CONSTRAINT "player_season_pitching_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_season_pitching" ADD CONSTRAINT "player_season_pitching_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "player_season_pitching_player_id_team_id_season_id_unique" ON "player_season_pitching" USING btree ("player_id","team_id","season_id");