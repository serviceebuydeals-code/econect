-- Device registrations and keys are server-only; never expose private signing material.
CREATE TABLE push_keys(id INTEGER PRIMARY KEY CHECK(id=1),public_key TEXT NOT NULL,private_key TEXT NOT NULL);
CREATE TABLE push_subscriptions(id TEXT PRIMARY KEY,user TEXT NOT NULL,endpoint TEXT NOT NULL UNIQUE,p256dh TEXT NOT NULL,auth TEXT NOT NULL,created INTEGER NOT NULL);
CREATE INDEX push_subscriptions_user ON push_subscriptions(user);
CREATE TABLE push_deliveries(id INTEGER PRIMARY KEY AUTOINCREMENT,subscription TEXT NOT NULL,user TEXT NOT NULL,kind TEXT NOT NULL,source TEXT NOT NULL,conversation TEXT,created INTEGER NOT NULL DEFAULT(unixepoch()),attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL DEFAULT 0,done INTEGER NOT NULL DEFAULT 0);
CREATE INDEX push_deliveries_pending ON push_deliveries(done,next_attempt,id);
CREATE TRIGGER push_new_message AFTER INSERT ON messages WHEN NEW.kind IN('text','voice','image','video','product','offer') BEGIN
 INSERT INTO push_deliveries(subscription,user,kind,source,conversation)
 SELECT s.id,s.user,CASE WHEN NEW.kind='offer' THEN 'call' ELSE 'message' END,NEW.id,NEW.conversation
 FROM push_subscriptions s JOIN conversations c ON c.id=NEW.conversation
 WHERE s.user=CASE WHEN c.starter=NEW.sender THEN c.recipient ELSE c.starter END AND s.user<>NEW.sender;
END;
CREATE TRIGGER push_new_activity AFTER INSERT ON activity_notifications BEGIN
 INSERT INTO push_deliveries(subscription,user,kind,source) SELECT id,user,'activity',CAST(NEW.id AS TEXT) FROM push_subscriptions WHERE user=NEW.user;
END;
