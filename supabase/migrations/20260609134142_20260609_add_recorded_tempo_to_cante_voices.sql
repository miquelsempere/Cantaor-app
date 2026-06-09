ALTER TABLE cante_voices ADD COLUMN IF NOT EXISTS recorded_tempo float;

DELETE FROM cante_voices WHERE id IN (
  '9b4c22d3-799a-46d0-a65d-ed368cd66e35',
  '92dd6d1c-0337-4e37-817f-6d71899f48ba',
  '864d5a46-5ee4-4769-a143-34e8e70b2d6d',
  '8f1e2799-ab24-4f6a-8d08-2f75ee0d855e',
  'decfaf7b-2ac1-429c-9aa9-8a0fc4c0b56b',
  '4672798c-ce53-4262-b280-7fb8d287f78f'
);

INSERT INTO cante_voices (palo, title, audio_url, duration, traste, recorded_tempo) VALUES
  ('Tangos', 'Tangos de Cádiz - T1 0.75x', 'https://bjyfaqgwdqvgcjhssfhj.supabase.co/storage/v1/object/public/cante-audio/voices/Tangos/Tangos%20de%20Cadiz/TANGOS%20DE%20CADIZ_T1_0.75X.mp3', 0, 1, 0.75),
  ('Tangos', 'Tangos de Cádiz - T1 1.00x', 'https://bjyfaqgwdqvgcjhssfhj.supabase.co/storage/v1/object/public/cante-audio/voices/Tangos/Tangos%20de%20Cadiz/TANGOS%20DE%20CADIZ_T1_1.00X.mp3', 0, 1, 1.0),
  ('Tangos', 'Tangos de Cádiz - T1 1.25x', 'https://bjyfaqgwdqvgcjhssfhj.supabase.co/storage/v1/object/public/cante-audio/voices/Tangos/Tangos%20de%20Cadiz/TANGOS%20DE%20CADIZ_T1_1.25X.mp3', 0, 1, 1.25),
  ('Tangos', 'Tangos de Cádiz - T4 0.75x', 'https://bjyfaqgwdqvgcjhssfhj.supabase.co/storage/v1/object/public/cante-audio/voices/Tangos/Tangos%20de%20Cadiz/TANGOS%20DE%20CADIZ_T4_0.75X.mp3', 0, 4, 0.75),
  ('Tangos', 'Tangos de Cádiz - T4 1.00x', 'https://bjyfaqgwdqvgcjhssfhj.supabase.co/storage/v1/object/public/cante-audio/voices/Tangos/Tangos%20de%20Cadiz/TANGOS%20DE%20CADIZ_T4_1.00X.mp3', 0, 4, 1.0),
  ('Tangos', 'Tangos de Cádiz - T4 1.25x', 'https://bjyfaqgwdqvgcjhssfhj.supabase.co/storage/v1/object/public/cante-audio/voices/Tangos/Tangos%20de%20Cadiz/TANGOS%20DE%20CADIZ_T4_1.25X.mp3', 0, 4, 1.25),
  ('Tangos', 'Tangos de Cádiz - T7 0.75x', 'https://bjyfaqgwdqvgcjhssfhj.supabase.co/storage/v1/object/public/cante-audio/voices/Tangos/Tangos%20de%20Cadiz/TANGOS%20DE%20CADIZ_T7_0.75X.mp3', 0, 7, 0.75),
  ('Tangos', 'Tangos de Cádiz - T7 1.00x', 'https://bjyfaqgwdqvgcjhssfhj.supabase.co/storage/v1/object/public/cante-audio/voices/Tangos/Tangos%20de%20Cadiz/TANGOS%20DE%20CADIZ_T7_1.00X.mp3', 0, 7, 1.0),
  ('Tangos', 'Tangos de Cádiz - T7 1.25x', 'https://bjyfaqgwdqvgcjhssfhj.supabase.co/storage/v1/object/public/cante-audio/voices/Tangos/Tangos%20de%20Cadiz/TANGOS%20DE%20CADIZ_T7_1.25X.mp3', 0, 7, 1.25);
