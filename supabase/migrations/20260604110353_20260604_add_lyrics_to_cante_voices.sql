/*
  # Add lyrics columns to cante_voices

  Adds word-level timestamp support to the cante_voices table for karaoke
  synchronization in ensayo mode.

  1. Modified Tables
    - `cante_voices`
      - `lyrics` (text, nullable) — plain text transcription of the voice
      - `lyrics_status` (text, nullable) — transcription pipeline status:
        'processing' | 'done' | 'error'
      - `lyrics_json` (jsonb, nullable) — word-level timestamp array from Whisper:
        [{ start: number, end: number, word: string }, ...]
        Used by the karaoke engine to highlight words in real time.

  2. Notes
    - Mirrors the same schema already present on cante_tracks
    - All new columns are nullable; existing rows remain valid without transcription
    - No RLS changes needed (cante_voices already has RLS with existing policies)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cante_voices' AND column_name = 'lyrics'
  ) THEN
    ALTER TABLE cante_voices ADD COLUMN lyrics text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cante_voices' AND column_name = 'lyrics_status'
  ) THEN
    ALTER TABLE cante_voices ADD COLUMN lyrics_status text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cante_voices' AND column_name = 'lyrics_json'
  ) THEN
    ALTER TABLE cante_voices ADD COLUMN lyrics_json jsonb;
  END IF;
END $$;
