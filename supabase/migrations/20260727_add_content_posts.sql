-- Content Planner — 1 row = 1 social post (Facebook / Instagram / TikTok)
CREATE TABLE IF NOT EXISTS content_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL CHECK (platform IN ('facebook','instagram','tiktok')),
  post_code text NOT NULL,
  post_date date,
  post_time text,
  format text,
  status text NOT NULL DEFAULT 'idea' CHECK (status IN ('idea','draft','design','ready','scheduled','published','hold')),
  pillar text,
  objective text,
  topic text,
  hook text,
  caption text,
  cta text,
  hashtags text,
  music text,
  asset_link text,
  owner text,
  post_url text,
  reach int, views int, likes int, comments int, shares int, saves int,
  note text,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_content_posts_platform ON content_posts(platform);
