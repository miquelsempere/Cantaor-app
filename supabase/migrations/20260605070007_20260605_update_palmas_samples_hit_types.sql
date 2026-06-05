-- Ampliar los hit_type permitidos de 3 a 4 variantes (fuerte1/2, floja1/2)
ALTER TABLE palmas_samples
  DROP CONSTRAINT IF EXISTS palmas_samples_hit_type_check;

ALTER TABLE palmas_samples
  ADD CONSTRAINT palmas_samples_hit_type_check
  CHECK (hit_type IN ('fuerte1', 'fuerte2', 'floja1', 'floja2'));
