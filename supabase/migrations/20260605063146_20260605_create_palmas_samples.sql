/*
  # Tabla palmas_samples
  Almacena samples individuales de golpes de palmas por palo y tipo de golpe.
  Cada fila es un audio corto de un unico golpe (fuerte, suave, sorda).
  El motor sampler (PalmasSampler) los dispara segun el patron del palo.
*/

CREATE TABLE IF NOT EXISTS palmas_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  palo text NOT NULL,
  hit_type text NOT NULL CHECK (hit_type IN ('fuerte', 'suave', 'sorda')),
  audio_url text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS palmas_samples_palo_idx ON palmas_samples(palo);
CREATE UNIQUE INDEX IF NOT EXISTS palmas_samples_palo_type_idx ON palmas_samples(palo, hit_type);

ALTER TABLE palmas_samples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read palmas samples"
  ON palmas_samples FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert palmas samples"
  ON palmas_samples FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update palmas samples"
  ON palmas_samples FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete palmas samples"
  ON palmas_samples FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);
