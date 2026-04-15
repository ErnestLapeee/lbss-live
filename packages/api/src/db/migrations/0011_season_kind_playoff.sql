-- Separate playoff seasons (own season row) + all-time stats excluding them by default

ALTER TABLE "seasons" DROP CONSTRAINT IF EXISTS "seasons_year_unique";

ALTER TABLE "seasons" ADD COLUMN IF NOT EXISTS "season_kind" varchar(20) NOT NULL DEFAULT 'regular';
ALTER TABLE "seasons" ADD COLUMN IF NOT EXISTS "parent_season_id" integer;

UPDATE "seasons" SET "season_kind" = 'regular' WHERE "season_kind" IS NULL;

ALTER TABLE "seasons" ADD CONSTRAINT "seasons_season_kind_check" CHECK ("season_kind" IN ('regular', 'playoff'));

ALTER TABLE "seasons" ADD CONSTRAINT "seasons_parent_season_id_seasons_id_fk" FOREIGN KEY ("parent_season_id") REFERENCES "public"."seasons"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

CREATE INDEX IF NOT EXISTS "seasons_season_kind_idx" ON "seasons"("season_kind");
CREATE INDEX IF NOT EXISTS "seasons_parent_season_id_idx" ON "seasons"("parent_season_id");
