/*
  # Tablero de Sugerencias

  Crea las tablas para el sistema de sugerencias tipo Canny integrado en la app.

  1. Nuevas Tablas
    - `suggestions`
      - `id` (uuid, PK)
      - `title` (text, not null) - Titulo de la sugerencia
      - `description` (text) - Descripcion opcional
      - `user_id` (uuid, FK -> auth.users) - Autor
      - `user_email` (text) - Email del autor para mostrar en UI
      - `vote_count` (integer, default 0) - Cache del total de votos
      - `created_at` (timestamptz)
    - `suggestion_votes`
      - `id` (uuid, PK)
      - `suggestion_id` (uuid, FK -> suggestions) - Sugerencia votada
      - `user_id` (uuid, FK -> auth.users) - Usuario que voto
      - `created_at` (timestamptz)
      - UNIQUE(suggestion_id, user_id) - Un voto por usuario por sugerencia

  2. Seguridad
    - RLS habilitado en ambas tablas
    - Cualquier usuario (incluso anónimo) puede leer sugerencias y votos
    - Solo usuarios autenticados pueden crear sugerencias y votar
    - Cada usuario solo puede gestionar sus propias sugerencias y votos

  3. Automatización
    - Trigger que actualiza vote_count en suggestions cuando se inserta/elimina un voto
*/

-- Tabla de sugerencias
CREATE TABLE IF NOT EXISTS suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text DEFAULT '',
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text DEFAULT '',
  vote_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Tabla de votos
CREATE TABLE IF NOT EXISTS suggestion_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion_id uuid NOT NULL REFERENCES suggestions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(suggestion_id, user_id)
);

-- Indices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_suggestions_vote_count ON suggestions(vote_count DESC);
CREATE INDEX IF NOT EXISTS idx_suggestion_votes_suggestion_id ON suggestion_votes(suggestion_id);
CREATE INDEX IF NOT EXISTS idx_suggestion_votes_user_id ON suggestion_votes(user_id);

-- Habilitar RLS
ALTER TABLE suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE suggestion_votes ENABLE ROW LEVEL SECURITY;

-- Politicas para suggestions
CREATE POLICY "Anyone can read suggestions"
  ON suggestions FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated users can create suggestions"
  ON suggestions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own suggestions"
  ON suggestions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own suggestions"
  ON suggestions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Politicas para suggestion_votes
CREATE POLICY "Anyone can read votes"
  ON suggestion_votes FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated users can vote"
  ON suggestion_votes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove their own votes"
  ON suggestion_votes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Funcion que sincroniza el contador de votos
CREATE OR REPLACE FUNCTION sync_suggestion_vote_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE suggestions SET vote_count = vote_count + 1 WHERE id = NEW.suggestion_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE suggestions SET vote_count = GREATEST(vote_count - 1, 0) WHERE id = OLD.suggestion_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para mantener vote_count actualizado
DROP TRIGGER IF EXISTS trigger_sync_vote_count ON suggestion_votes;
CREATE TRIGGER trigger_sync_vote_count
  AFTER INSERT OR DELETE ON suggestion_votes
  FOR EACH ROW EXECUTE FUNCTION sync_suggestion_vote_count();
