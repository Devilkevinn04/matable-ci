ALTER TABLE subscription_payment_intents
  ADD COLUMN IF NOT EXISTS payment_type TEXT NOT NULL DEFAULT 'subscription';