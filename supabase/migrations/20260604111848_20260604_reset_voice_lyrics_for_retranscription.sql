/*
  # Reset cante_voices lyrics_json and lyrics_status for re-transcription

  The word-level timestamps (lyrics_json) were not saved correctly in the
  previous transcription run due to a bug in the edge function. This migration
  resets lyrics_status to NULL so the admin panel shows the "Transcribir letra"
  button again. The corrected lyrics text is preserved.

  1. Modified Tables
    - `cante_voices`: reset lyrics_json = NULL and lyrics_status = NULL
      for all rows where lyrics_status = 'done'
*/

UPDATE cante_voices
SET lyrics_json = NULL,
    lyrics_status = NULL
WHERE lyrics_status = 'done';
