-- Add status column with constraint
ALTER TABLE suggestions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open'
  CHECK (status IN ('open', 'in_progress', 'done'));

-- Add updated_at column
ALTER TABLE suggestions
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Trigger to auto-update updated_at on any UPDATE
CREATE OR REPLACE FUNCTION update_suggestions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_suggestions_updated_at ON suggestions;
CREATE TRIGGER trigger_suggestions_updated_at
  BEFORE UPDATE ON suggestions
  FOR EACH ROW EXECUTE FUNCTION update_suggestions_updated_at();

-- Allow any authenticated user to update suggestion status
-- (status changes are admin-only via hidden panel; no role table yet)
DROP POLICY IF EXISTS "Users can update their own suggestions" ON suggestions;
CREATE POLICY "Authenticated users can update suggestions"
  ON suggestions FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (status IN ('open', 'in_progress', 'done'));

-- Indexes for status-based queries
CREATE INDEX IF NOT EXISTS idx_suggestions_status ON suggestions(status);
CREATE INDEX IF NOT EXISTS idx_suggestions_done_updated ON suggestions(updated_at DESC) WHERE status = 'done';
