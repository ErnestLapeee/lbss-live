CREATE TABLE "seasons" (
	"id" serial PRIMARY KEY NOT NULL,
	"year" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"start_date" date,
	"end_date" date,
	"is_active" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "seasons_year_unique" UNIQUE("year")
);
--> statement-breakpoint
CREATE TABLE "leagues" (
	"id" serial PRIMARY KEY NOT NULL,
	"season_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"sport" varchar(20) DEFAULT 'baseball',
	"level" varchar(20) DEFAULT 'senior',
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "league_teams" (
	"id" serial PRIMARY KEY NOT NULL,
	"league_id" integer NOT NULL,
	"team_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"short_name" varchar(20),
	"slug" varchar(100) NOT NULL,
	"city" varchar(100),
	"logo_url" varchar(500),
	"founded_year" integer,
	"description" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "teams_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "player_seasons" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"team_id" integer NOT NULL,
	"season_id" integer NOT NULL,
	"jersey_number" varchar(5),
	"position" varchar(5),
	"role" varchar(20) DEFAULT 'player'
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" serial PRIMARY KEY NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"slug" varchar(200) NOT NULL,
	"date_of_birth" date,
	"nationality" varchar(50) DEFAULT 'LV',
	"throws" varchar(1),
	"bats" varchar(1),
	"height_cm" integer,
	"weight_kg" integer,
	"photo_url" varchar(500),
	"bio" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "players_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"role" varchar(20) DEFAULT 'public',
	"player_id" integer,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" serial PRIMARY KEY NOT NULL,
	"league_id" integer NOT NULL,
	"home_team_id" integer NOT NULL,
	"away_team_id" integer NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"venue" varchar(200),
	"status" varchar(20) DEFAULT 'scheduled',
	"home_score" integer DEFAULT 0,
	"away_score" integer DEFAULT 0,
	"innings_count" integer DEFAULT 9,
	"current_inning" integer,
	"current_half" varchar(3),
	"current_outs" integer DEFAULT 0,
	"is_finalized" boolean DEFAULT false,
	"finalized_at" timestamp with time zone,
	"finalized_by" integer,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "game_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"game_id" integer NOT NULL,
	"event_number" integer NOT NULL,
	"inning" integer NOT NULL,
	"half" varchar(3) NOT NULL,
	"batter_id" integer,
	"pitcher_id" integer,
	"event_type" varchar(30) NOT NULL,
	"event_detail" text,
	"rbi" integer DEFAULT 0,
	"runs_scored" integer DEFAULT 0,
	"outs_recorded" integer DEFAULT 0,
	"errors_on_play" integer DEFAULT 0,
	"balls" integer DEFAULT 0,
	"strikes" integer DEFAULT 0,
	"runner_first_id" integer,
	"runner_second_id" integer,
	"runner_third_id" integer,
	"runners_scored" jsonb DEFAULT '[]'::jsonb,
	"is_deleted" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"created_by" integer
);
--> statement-breakpoint
CREATE TABLE "player_game_batting" (
	"id" serial PRIMARY KEY NOT NULL,
	"game_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"team_id" integer NOT NULL,
	"plate_appearances" integer DEFAULT 0,
	"at_bats" integer DEFAULT 0,
	"hits" integer DEFAULT 0,
	"singles" integer DEFAULT 0,
	"doubles" integer DEFAULT 0,
	"triples" integer DEFAULT 0,
	"home_runs" integer DEFAULT 0,
	"rbi" integer DEFAULT 0,
	"runs" integer DEFAULT 0,
	"walks" integer DEFAULT 0,
	"strikeouts" integer DEFAULT 0,
	"hit_by_pitch" integer DEFAULT 0,
	"sacrifice_flies" integer DEFAULT 0,
	"sacrifice_bunts" integer DEFAULT 0,
	"stolen_bases" integer DEFAULT 0,
	"caught_stealing" integer DEFAULT 0,
	"errors" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "player_game_pitching" (
	"id" serial PRIMARY KEY NOT NULL,
	"game_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"team_id" integer NOT NULL,
	"innings_pitched" numeric(4, 1) DEFAULT '0',
	"hits_allowed" integer DEFAULT 0,
	"runs_allowed" integer DEFAULT 0,
	"earned_runs" integer DEFAULT 0,
	"walks_allowed" integer DEFAULT 0,
	"strikeouts" integer DEFAULT 0,
	"home_runs_allowed" integer DEFAULT 0,
	"hit_batters" integer DEFAULT 0,
	"wild_pitches" integer DEFAULT 0,
	"pitches_thrown" integer,
	"is_starter" boolean DEFAULT false,
	"decision" varchar(5)
);
--> statement-breakpoint
CREATE TABLE "player_season_batting" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"team_id" integer NOT NULL,
	"season_id" integer NOT NULL,
	"games" integer DEFAULT 0,
	"plate_appearances" integer DEFAULT 0,
	"at_bats" integer DEFAULT 0,
	"hits" integer DEFAULT 0,
	"singles" integer DEFAULT 0,
	"doubles" integer DEFAULT 0,
	"triples" integer DEFAULT 0,
	"home_runs" integer DEFAULT 0,
	"rbi" integer DEFAULT 0,
	"runs" integer DEFAULT 0,
	"walks" integer DEFAULT 0,
	"strikeouts" integer DEFAULT 0,
	"hit_by_pitch" integer DEFAULT 0,
	"stolen_bases" integer DEFAULT 0,
	"caught_stealing" integer DEFAULT 0,
	"sacrifice_flies" integer DEFAULT 0,
	"sacrifice_bunts" integer DEFAULT 0,
	"batting_avg" numeric(4, 3),
	"on_base_pct" numeric(4, 3),
	"slugging_pct" numeric(4, 3),
	"ops" numeric(5, 3),
	"last_computed_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "standings" (
	"id" serial PRIMARY KEY NOT NULL,
	"league_id" integer NOT NULL,
	"team_id" integer NOT NULL,
	"wins" integer DEFAULT 0,
	"losses" integer DEFAULT 0,
	"ties" integer DEFAULT 0,
	"games_played" integer DEFAULT 0,
	"runs_scored" integer DEFAULT 0,
	"runs_allowed" integer DEFAULT 0,
	"win_pct" numeric(4, 3) DEFAULT '0',
	"games_behind" numeric(4, 1),
	"streak" varchar(10),
	"last_ten" varchar(10),
	"last_computed_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "licenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"season_id" integer NOT NULL,
	"status" varchar(20) DEFAULT 'pending',
	"medical_clearance" boolean DEFAULT false,
	"insurance_verified" boolean DEFAULT false,
	"payment_status" varchar(20) DEFAULT 'unpaid',
	"issued_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"license_id" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'EUR',
	"method" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'pending',
	"stripe_payment_id" varchar(200),
	"reference_number" varchar(100),
	"confirmed_by" integer,
	"confirmed_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "articles" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(300) NOT NULL,
	"slug" varchar(300) NOT NULL,
	"content" text NOT NULL,
	"excerpt" text,
	"cover_image_url" varchar(500),
	"author_id" integer,
	"is_published" boolean DEFAULT false,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "articles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "leagues" ADD CONSTRAINT "leagues_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_teams" ADD CONSTRAINT "league_teams_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_teams" ADD CONSTRAINT "league_teams_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_seasons" ADD CONSTRAINT "player_seasons_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_seasons" ADD CONSTRAINT "player_seasons_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_seasons" ADD CONSTRAINT "player_seasons_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_home_team_id_teams_id_fk" FOREIGN KEY ("home_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_away_team_id_teams_id_fk" FOREIGN KEY ("away_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_finalized_by_users_id_fk" FOREIGN KEY ("finalized_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_events" ADD CONSTRAINT "game_events_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_events" ADD CONSTRAINT "game_events_batter_id_players_id_fk" FOREIGN KEY ("batter_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_events" ADD CONSTRAINT "game_events_pitcher_id_players_id_fk" FOREIGN KEY ("pitcher_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_events" ADD CONSTRAINT "game_events_runner_first_id_players_id_fk" FOREIGN KEY ("runner_first_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_events" ADD CONSTRAINT "game_events_runner_second_id_players_id_fk" FOREIGN KEY ("runner_second_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_events" ADD CONSTRAINT "game_events_runner_third_id_players_id_fk" FOREIGN KEY ("runner_third_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_events" ADD CONSTRAINT "game_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_game_batting" ADD CONSTRAINT "player_game_batting_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_game_batting" ADD CONSTRAINT "player_game_batting_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_game_batting" ADD CONSTRAINT "player_game_batting_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_game_pitching" ADD CONSTRAINT "player_game_pitching_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_game_pitching" ADD CONSTRAINT "player_game_pitching_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_game_pitching" ADD CONSTRAINT "player_game_pitching_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_season_batting" ADD CONSTRAINT "player_season_batting_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_season_batting" ADD CONSTRAINT "player_season_batting_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_season_batting" ADD CONSTRAINT "player_season_batting_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standings" ADD CONSTRAINT "standings_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standings" ADD CONSTRAINT "standings_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_license_id_licenses_id_fk" FOREIGN KEY ("license_id") REFERENCES "public"."licenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "leagues_season_id_slug_unique" ON "leagues" USING btree ("season_id","slug");--> statement-breakpoint
CREATE INDEX "leagues_season_id_idx" ON "leagues" USING btree ("season_id");--> statement-breakpoint
CREATE UNIQUE INDEX "league_teams_league_id_team_id_unique" ON "league_teams" USING btree ("league_id","team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "player_seasons_player_id_team_id_season_id_unique" ON "player_seasons" USING btree ("player_id","team_id","season_id");--> statement-breakpoint
CREATE INDEX "games_league_id_idx" ON "games" USING btree ("league_id");--> statement-breakpoint
CREATE INDEX "games_status_idx" ON "games" USING btree ("status");--> statement-breakpoint
CREATE INDEX "games_scheduled_at_idx" ON "games" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "games_home_team_id_idx" ON "games" USING btree ("home_team_id");--> statement-breakpoint
CREATE INDEX "games_away_team_id_idx" ON "games" USING btree ("away_team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "game_events_game_id_event_number_unique" ON "game_events" USING btree ("game_id","event_number");--> statement-breakpoint
CREATE INDEX "game_events_game_id_idx" ON "game_events" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "game_events_batter_id_idx" ON "game_events" USING btree ("batter_id");--> statement-breakpoint
CREATE INDEX "game_events_pitcher_id_idx" ON "game_events" USING btree ("pitcher_id");--> statement-breakpoint
CREATE INDEX "game_events_event_type_idx" ON "game_events" USING btree ("event_type");--> statement-breakpoint
CREATE UNIQUE INDEX "player_game_batting_game_id_player_id_unique" ON "player_game_batting" USING btree ("game_id","player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "player_game_pitching_game_id_player_id_unique" ON "player_game_pitching" USING btree ("game_id","player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "player_season_batting_player_id_team_id_season_id_unique" ON "player_season_batting" USING btree ("player_id","team_id","season_id");--> statement-breakpoint
CREATE UNIQUE INDEX "standings_league_id_team_id_unique" ON "standings" USING btree ("league_id","team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "licenses_player_id_season_id_unique" ON "licenses" USING btree ("player_id","season_id");