ALTER TABLE cante_voices ADD COLUMN IF NOT EXISTS canonical_title text;

UPDATE cante_voices
SET canonical_title = 'Tangos de Cádiz'
WHERE title LIKE 'Tangos de Cádiz - T%';
