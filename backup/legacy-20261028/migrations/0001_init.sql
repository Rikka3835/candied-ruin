-- BUBBLE VANGUARD · D1 schema
-- Apply once per D1 database:
--   npx wrangler d1 execute bubble-vanguard-db --remote --file=./migrations/0001_init.sql

CREATE TABLE IF NOT EXISTS chapters (
  number       INTEGER PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,
  ordinal      TEXT NOT NULL,
  title        TEXT NOT NULL,
  subtitle     TEXT NOT NULL DEFAULT '',
  kicker       TEXT NOT NULL DEFAULT '',
  volume       TEXT NOT NULL DEFAULT '第一卷 白榆之灯',
  summary      TEXT NOT NULL DEFAULT '',
  quote        TEXT NOT NULL DEFAULT '',
  tags_json    TEXT NOT NULL DEFAULT '[]',
  sections_json TEXT NOT NULL,
  chars        INTEGER NOT NULL DEFAULT 0,
  minutes      INTEGER NOT NULL DEFAULT 0,
  updated_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chapters_slug ON chapters(slug);
