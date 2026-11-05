ALTER TABLE push_deliveries ADD COLUMN delivery_state TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE push_deliveries ADD COLUMN provider_status INTEGER NOT NULL DEFAULT 0;
