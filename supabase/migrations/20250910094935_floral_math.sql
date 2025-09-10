/*
  # Create cante tracks table for flamenco guitar practice app

  1. New Tables
    - `cante_tracks`
      - `id` (uuid, primary key) - Unique identifier for each track
      - `palo` (text, not null) - Flamenco palo/style (e.g., 'soleares', 'alegrias', 'bulerias')
      - `title` (text, not null) - Title or description of the cante fragment
      - `audio_url` (text, not null) - Public URL to the audio file in Supabase Storage
      - `duration` (integer) - Duration of the track in seconds (optional, for future use)
      - `created_at` (timestamptz) - When the track was added
      - `updated_at` (timestamptz) - When the track was last modified

  2. Security
    - Enable RLS on `cante_tracks` table
    - Add policy for public read access (no authentication required for reading tracks)
    - Restrict write access to authenticated users only (for future admin functionality)

  3. Indexes
    - Add index on `palo` column for efficient filtering by flamenco style
*/

-- Create the cante_tracks table
CREATE TABLE IF NOT EXISTS cante_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  palo text NOT NULL,
  title text NOT NULL,
  audio_url text NOT NULL,
  duration integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE cante_tracks ENABLE ROW LEVEL SECURITY;

-- Create policy for public read access (anyone can read tracks)
CREATE POLICY "Anyone can read cante tracks"
  ON cante_tracks
  FOR SELECT
  TO public
  USING (true);

-- Create policy for authenticated users to insert tracks (for future admin functionality)
CREATE POLICY "Authenticated users can insert cante tracks"
  ON cante_tracks
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create policy for authenticated users to update tracks (for future admin functionality)
CREATE POLICY "Authenticated users can update cante tracks"
  ON cante_tracks
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create policy for authenticated users to delete tracks (for future admin functionality)
CREATE POLICY "Authenticated users can delete cante tracks"
  ON cante_tracks
  FOR DELETE
  TO authenticated
  USING (true);

-- Create index on palo column for efficient filtering
CREATE INDEX IF NOT EXISTS idx_cante_tracks_palo ON cante_tracks(palo);

-- Create function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at on row updates
CREATE TRIGGER update_cante_tracks_updated_at
  BEFORE UPDATE ON cante_tracks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();