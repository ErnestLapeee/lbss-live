CREATE TABLE IF NOT EXISTS scoring_client_ops (
  game_id integer NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  client_op_id varchar(80) NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (game_id, client_op_id)
);
