/*
  # Create palos table for public menu listing

  1. New Tables
    - `palos`
      - `id` (uuid, primary key)
      - `nombre` (text, unique, not null) - Palo name as displayed in the menu
      - `free` (boolean, default false) - Whether the palo is accessible without authentication
      - `orden` (integer, default 0) - Sort order in the dropdown menu

  2. Security
    - Enable RLS on `palos` table
    - Add public SELECT policy so the menu always shows all palos to everyone
    - Restrict INSERT/UPDATE/DELETE to authenticated users only

  3. Initial data
    - Insert Tangos (free: true, orden: 1)
    - Insert Bulerias (free: false, orden: 2)

  4. Notes
    - This table is the source of truth for the dropdown menu.
      It is intentionally decoupled from cante_tracks so that palos
      appear in the menu even when no tracks are loaded yet, and so
      the menu is always visible to unauthenticated users.
    - The cante_tracks RLS remains restrictive; this table only exposes
      the existence and metadata of each palo.
*/

CREATE TABLE IF NOT EXISTS palos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text UNIQUE NOT NULL,
  free boolean NOT NULL DEFAULT false,
  orden integer NOT NULL DEFAULT 0
);

ALTER TABLE palos ENABLE ROW LEVEL SECURITY;

-- Anyone can read the list of palos (needed for the dropdown menu)
CREATE POLICY "Anyone can read palos"
  ON palos
  FOR SELECT
  TO public
  USING (true);

-- Only authenticated users can insert palos
CREATE POLICY "Authenticated users can insert palos"
  ON palos
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Only authenticated users can update palos
CREATE POLICY "Authenticated users can update palos"
  ON palos
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Only authenticated users can delete palos
CREATE POLICY "Authenticated users can delete palos"
  ON palos
  FOR DELETE
  TO authenticated
  USING (true);

-- Seed the initial palos
INSERT INTO palos (nombre, free, orden)
VALUES
  ('Tangos', true, 1),
  ('Bulerias', false, 2)
ON CONFLICT (nombre) DO NOTHING;
