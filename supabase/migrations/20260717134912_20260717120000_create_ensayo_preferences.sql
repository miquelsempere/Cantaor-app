/*
# Create ensayo_preferences table

1. New Tables
- `ensayo_preferences`
  - `id` (uuid, primary key)
  - `user_id` (uuid, not null, defaults to authenticated user, references auth.users)
  - `palo` (text, not null) - the flamenco palo these preferences apply to
  - `mode` (text, not null, default 'random') - 'random' or 'selection'
  - `selected_titles` (jsonb, default '[]') - array of canonical titles selected in selection mode
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)
- Unique constraint on (user_id, palo) so each user has one preference row per palo.

2. Security
- Enable RLS on `ensayo_preferences`.
- Owner-scoped CRUD: each authenticated user can only access their own preference rows.
- user_id defaults to auth.uid() so inserts that omit it still pass the WITH CHECK.
*/

CREATE TABLE IF NOT EXISTS ensayo_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  palo text NOT NULL,
  mode text NOT NULL DEFAULT 'random' CHECK (mode IN ('random', 'selection')),
  selected_titles jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, palo)
);

ALTER TABLE ensayo_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_ensayo_preferences" ON ensayo_preferences;
CREATE POLICY "select_own_ensayo_preferences"
ON ensayo_preferences FOR SELECT
TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_ensayo_preferences" ON ensayo_preferences;
CREATE POLICY "insert_own_ensayo_preferences"
ON ensayo_preferences FOR INSERT
TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_ensayo_preferences" ON ensayo_preferences;
CREATE POLICY "update_own_ensayo_preferences"
ON ensayo_preferences FOR UPDATE
TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_ensayo_preferences" ON ensayo_preferences;
CREATE POLICY "delete_own_ensayo_preferences"
ON ensayo_preferences FOR DELETE
TO authenticated USING (auth.uid() = user_id);