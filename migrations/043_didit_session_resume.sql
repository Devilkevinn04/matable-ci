-- Reprise de session et raisons de refus (sans données personnelles).
ALTER TABLE didit_verification_sessions
  ADD COLUMN IF NOT EXISTS session_url TEXT;
ALTER TABLE didit_verification_sessions
  ADD COLUMN IF NOT EXISTS decline_reasons TEXT;
ALTER TABLE didit_verification_sessions
  ADD COLUMN IF NOT EXISTS decision_fetched_at TEXT;

-- Comptage rapide des sessions terminées par mois (budget Didit).
CREATE INDEX IF NOT EXISTS idx_didit_sessions_created
  ON didit_verification_sessions(created_at);
