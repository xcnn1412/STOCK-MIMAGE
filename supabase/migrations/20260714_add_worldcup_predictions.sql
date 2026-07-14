-- WORLDCUP 2026 (temporary feature) — one champion pick per user, immutable.
-- Drop this table when removing the feature after the tournament:
--   DROP TABLE IF EXISTS worldcup_predictions;
CREATE TABLE IF NOT EXISTS worldcup_predictions (
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  team text NOT NULL CHECK (team IN ('france', 'spain', 'england', 'argentina')),
  created_at timestamptz NOT NULL DEFAULT now()
);
