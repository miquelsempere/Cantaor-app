/*
  # Add lyrics columns to cante_tracks

  ## Summary
  Adds automatic transcription support to audio tracks.

  ## New Columns (cante_tracks)
  - `lyrics` (text) — Full transcribed lyrics text, null until processed
  - `lyrics_status` (text) — Transcription state: null | 'processing' | 'done' | 'error'

  ## Notes
  - No RLS changes needed; existing policies cover the new columns
  - Default values are null to distinguish "never transcribed" from "empty result"
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cante_tracks' AND column_name = 'lyrics'
  ) THEN
    ALTER TABLE cante_tracks ADD COLUMN lyrics text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cante_tracks' AND column_name = 'lyrics_status'
  ) THEN
    ALTER TABLE cante_tracks ADD COLUMN lyrics_status text;
  END IF;
END $$;
