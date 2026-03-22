-- Email cache: store emails locally on ingest so they're searchable after marking read
CREATE TABLE IF NOT EXISTS emails (
  gmail_id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  account_id UUID NOT NULL REFERENCES google_accounts(id),
  from_address TEXT NOT NULL,
  to_addresses JSONB NOT NULL DEFAULT '[]',
  cc_addresses JSONB DEFAULT '[]',
  subject TEXT NOT NULL DEFAULT '',
  snippet TEXT NOT NULL DEFAULT '',
  body TEXT,
  summary TEXT,
  email_date TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_emails_account_id ON emails(account_id);
CREATE INDEX idx_emails_email_date ON emails(email_date DESC);
CREATE INDEX idx_emails_from ON emails(from_address);
CREATE INDEX idx_emails_received_at ON emails(received_at DESC);

-- Full-text search index on subject, snippet, from, body
CREATE INDEX idx_emails_search ON emails USING gin(
  to_tsvector('english', coalesce(subject, '') || ' ' || coalesce(snippet, '') || ' ' || coalesce(from_address, '') || ' ' || coalesce(body, ''))
);
