CREATE TABLE rtc_calls(id TEXT PRIMARY KEY,conversation TEXT NOT NULL REFERENCES conversations(id),caller TEXT NOT NULL REFERENCES profiles(id),recipient TEXT NOT NULL REFERENCES profiles(id),video INTEGER NOT NULL CHECK(video IN(0,1)),status TEXT NOT NULL DEFAULT 'ringing' CHECK(status IN('ringing','active','ended')),created INTEGER NOT NULL,expires INTEGER NOT NULL,caller_seen INTEGER NOT NULL,recipient_seen INTEGER NOT NULL DEFAULT 0,ended INTEGER,CHECK(caller<>recipient));
CREATE INDEX rtc_incoming ON rtc_calls(recipient,status,expires);
CREATE INDEX rtc_caller ON rtc_calls(caller,status,expires);
CREATE TABLE rtc_signals(id INTEGER PRIMARY KEY AUTOINCREMENT,call_id TEXT NOT NULL REFERENCES rtc_calls(id),sender TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN('offer','answer','ice')),body TEXT NOT NULL,created INTEGER NOT NULL);
CREATE INDEX rtc_signal_call ON rtc_signals(call_id,id);
CREATE TRIGGER rtc_busy BEFORE INSERT ON rtc_calls WHEN EXISTS(SELECT 1 FROM rtc_calls WHERE status IN('ringing','active') AND expires>NEW.created AND (caller IN(NEW.caller,NEW.recipient) OR recipient IN(NEW.caller,NEW.recipient))) BEGIN SELECT RAISE(ABORT,'One of you is already on a call.');END;
CREATE TRIGGER rtc_push AFTER INSERT ON rtc_calls BEGIN
 INSERT INTO push_deliveries(subscription,user,kind,source,conversation) SELECT id,user,'call','rtc:'||NEW.id,NEW.conversation FROM push_subscriptions WHERE user=NEW.recipient;
END;
