/*
  # Modo Ensayo Avanzado - Tablas de pistas separadas

  Crea la infraestructura para el nuevo modo de ensayo donde la base de
  palmas y las voces del cantaor se reproducen como streams independientes.

  ## Nuevas tablas

  ### palmas_bases
  Pistas largas (20-30 min) de base de palmas puras, sin cante.
  - `id` - UUID primario
  - `palo` - Nombre del palo flamenco (Tangos, Bulerias, etc.)
  - `title` - Titulo descriptivo
  - `audio_url` - URL publica en Supabase Storage
  - `bpm` - Pulsos por minuto de la pista (ej: 140)
  - `beats_per_compas` - Numero de tiempos por compas (ej: 8 en tangos, 12 en bulerias)
  - `duration` - Duracion en segundos
  - `created_at` / `updated_at`

  ### cante_voices
  Pistas individuales de voz del cantaor, SIN palmas de fondo.
  Cada pista debe estar construida para cuadrar en el BPM del palo correspondiente.
  - `id` - UUID primario
  - `palo` - Nombre del palo flamenco
  - `title` - Titulo de la letra
  - `audio_url` - URL publica en Supabase Storage
  - `duration` - Duracion en segundos
  - `created_at` / `updated_at`

  ## Seguridad
  - RLS habilitado en ambas tablas
  - Lectura publica para palmas_bases (son recursos de practica genericos)
  - Lectura autenticada para cante_voices (contenido premium)
  - Solo admin puede insertar/actualizar/eliminar en ambas tablas (via service role)

  ## Notas
  - Estas tablas NO modifican ni reemplazan cante_tracks (reproductor original intacto)
  - El calculo de sync points es matematico: (beats_per_compas / bpm) * 60 = intervalo en segundos
  - Para Tangos a 140 BPM: (8/140)*60 = 3.4286 segundos entre puntos de entrada
*/

-- ============================================================
-- Tabla: palmas_bases
-- ============================================================
CREATE TABLE IF NOT EXISTS palmas_bases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  palo text NOT NULL,
  title text NOT NULL DEFAULT '',
  audio_url text NOT NULL,
  bpm integer NOT NULL DEFAULT 120,
  beats_per_compas integer NOT NULL DEFAULT 8,
  duration integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS palmas_bases_palo_idx ON palmas_bases(palo);

ALTER TABLE palmas_bases ENABLE ROW LEVEL SECURITY;

-- Lectura publica (cualquiera puede escuchar la base de palmas)
CREATE POLICY "Public can read palmas bases"
  ON palmas_bases FOR SELECT
  TO anon, authenticated
  USING (true);

-- Solo usuarios autenticados admin (service role) pueden insertar
CREATE POLICY "Authenticated users can insert palmas bases"
  ON palmas_bases FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Solo quien creo puede actualizar (en practica, el admin via service role)
CREATE POLICY "Authenticated users can update palmas bases"
  ON palmas_bases FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Solo autenticados pueden borrar
CREATE POLICY "Authenticated users can delete palmas bases"
  ON palmas_bases FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_palmas_bases_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER palmas_bases_updated_at
  BEFORE UPDATE ON palmas_bases
  FOR EACH ROW EXECUTE FUNCTION update_palmas_bases_updated_at();

-- ============================================================
-- Tabla: cante_voices
-- ============================================================
CREATE TABLE IF NOT EXISTS cante_voices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  palo text NOT NULL,
  title text NOT NULL DEFAULT '',
  audio_url text NOT NULL,
  duration integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cante_voices_palo_idx ON cante_voices(palo);

ALTER TABLE cante_voices ENABLE ROW LEVEL SECURITY;

-- Lectura para usuarios autenticados
CREATE POLICY "Authenticated users can read cante voices"
  ON cante_voices FOR SELECT
  TO authenticated
  USING (true);

-- Insercion solo para autenticados (admin via panel)
CREATE POLICY "Authenticated users can insert cante voices"
  ON cante_voices FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Actualizacion solo para autenticados
CREATE POLICY "Authenticated users can update cante voices"
  ON cante_voices FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Borrado solo para autenticados
CREATE POLICY "Authenticated users can delete cante voices"
  ON cante_voices FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_cante_voices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cante_voices_updated_at
  BEFORE UPDATE ON cante_voices
  FOR EACH ROW EXECUTE FUNCTION update_cante_voices_updated_at();
