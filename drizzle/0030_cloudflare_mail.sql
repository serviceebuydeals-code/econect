ALTER TABLE admin_mail_messages ADD COLUMN provider TEXT NOT NULL DEFAULT 'resend' CHECK(provider IN('resend','cloudflare'));
ALTER TABLE admin_mail_messages ADD COLUMN raw_key TEXT NOT NULL DEFAULT '';
ALTER TABLE admin_mail_messages ADD COLUMN reply_address TEXT NOT NULL DEFAULT '';
ALTER TABLE admin_mail_messages ADD COLUMN send_uncertain INTEGER NOT NULL DEFAULT 0 CHECK(send_uncertain IN(0,1));
