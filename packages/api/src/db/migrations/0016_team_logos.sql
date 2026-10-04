CREATE TABLE IF NOT EXISTS team_logos (
  team_id integer PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
  content_type varchar(40) NOT NULL,
  data bytea NOT NULL,
  updated_at timestamptz DEFAULT now()
);
