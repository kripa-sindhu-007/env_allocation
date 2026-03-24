-- =============================================
-- Environment Manager — Supabase Schema v2
-- =============================================
-- Run this fresh, or drop existing tables first:
--   DROP TABLE IF EXISTS history;
--   DROP TABLE IF EXISTS environments;

-- Environments table
CREATE TABLE environments (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('Backend-APIs', 'Backend-Portal', 'Frontend-PWA', 'Frontend-Portal')),
  status TEXT NOT NULL DEFAULT 'free' CHECK (status IN ('free', 'in-use')),
  owner TEXT,
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(name, category)
);

ALTER TABLE environments DISABLE ROW LEVEL SECURITY;

-- History table
CREATE TABLE history (
  id SERIAL PRIMARY KEY,
  env_id INTEGER NOT NULL REFERENCES environments(id),
  action TEXT NOT NULL CHECK (action IN ('reserve', 'release', 'note-update')),
  user_name TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE history DISABLE ROW LEVEL SECURITY;

CREATE INDEX idx_history_env_id ON history(env_id);
CREATE INDEX idx_history_created_at ON history(created_at DESC);

-- Seed: 24 environments × 4 categories = 96 rows
INSERT INTO environments (name, category)
SELECT n.name, c.category
FROM (VALUES
  ('test-1'),  ('test-2'),  ('test-3'),  ('test-4'),  ('test-5'),
  ('test-6'),  ('test-7'),  ('test-8'),  ('test-9'),  ('test-10'),
  ('test-11'), ('test-12'), ('test-13'), ('test-14'), ('test-15'),
  ('test-16'), ('test-17'), ('test-18'), ('test-19'), ('test-20'),
  ('alpha-1'), ('alpha-2'), ('alpha-3'), ('main-alpha')
) AS n(name)
CROSS JOIN (VALUES ('Backend-APIs'), ('Backend-Portal'), ('Frontend-PWA'), ('Frontend-Portal')) AS c(category);
