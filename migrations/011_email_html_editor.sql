-- V0.9.5: additive storage for validated, full HTML email documents.
-- Existing simplified body and all transactional/campaign sends remain unchanged
-- until the V2 renderer is enabled with tested validation and migration.
ALTER TABLE message_templates
  ADD COLUMN IF NOT EXISTS html_body text;
ALTER TABLE email_campaigns
  ADD COLUMN IF NOT EXISTS html_body text;
