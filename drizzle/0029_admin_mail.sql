CREATE TABLE admin_mail_messages(
 id TEXT PRIMARY KEY,
 direction TEXT NOT NULL CHECK(direction IN('in','out')),
 mailbox TEXT NOT NULL,
 sender TEXT NOT NULL,
 recipient TEXT NOT NULL,
 subject TEXT NOT NULL,
 body TEXT NOT NULL,
 attachments TEXT NOT NULL DEFAULT '[]',
 provider_id TEXT UNIQUE,
 status TEXT NOT NULL CHECK(status IN('received','pending','sent','failed')),
 created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 created_ms INTEGER NOT NULL,
 read_at TEXT,
 archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN(0,1)),
 attempts INTEGER NOT NULL DEFAULT 0,
 lease_until INTEGER NOT NULL DEFAULT 0,
 created_by TEXT,
 last_error TEXT NOT NULL DEFAULT ''
);
CREATE INDEX admin_mail_folder ON admin_mail_messages(direction,archived,created_ms DESC);
CREATE TRIGGER admin_mail_received AFTER INSERT ON admin_mail_messages WHEN NEW.direction='in' BEGIN
 INSERT INTO activity_notifications(user,label)
 SELECT p.id,'Admin: new email received in '||NEW.mailbox||'. Open Mail in Admin studio.'
 FROM profiles p JOIN auth_users a ON a.id=p.id WHERE a.is_admin=1;
END;
CREATE TRIGGER admin_mail_sent AFTER UPDATE OF status ON admin_mail_messages WHEN NEW.status='sent' AND OLD.status!='sent' BEGIN
 INSERT INTO activity_notifications(user,label)
 SELECT p.id,'Admin: email sent from '||NEW.mailbox||' to '||NEW.recipient||'. Open Mail in Admin studio.'
 FROM profiles p JOIN auth_users a ON a.id=p.id WHERE a.is_admin=1;
END;
