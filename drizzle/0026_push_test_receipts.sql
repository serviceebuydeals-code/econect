-- Diagnostics for explicitly requested notification tests only.
-- The token is sent inside the encrypted payload and never returned by status APIs.
ALTER TABLE push_deliveries ADD COLUMN receipt_token TEXT;
ALTER TABLE push_deliveries ADD COLUMN device_state TEXT NOT NULL DEFAULT '' CHECK(device_state IN('','shown','display_failed'));
ALTER TABLE push_deliveries ADD COLUMN device_reported_at INTEGER;
ALTER TABLE push_deliveries ADD COLUMN device_page_visible INTEGER;
CREATE UNIQUE INDEX push_test_receipt ON push_deliveries(receipt_token) WHERE receipt_token IS NOT NULL;
