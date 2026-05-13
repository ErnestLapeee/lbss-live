ALTER TABLE "games" ADD COLUMN IF NOT EXISTS "umpire" varchar(200);
ALTER TABLE "games" ADD COLUMN IF NOT EXISTS "official_scorer" varchar(200);
