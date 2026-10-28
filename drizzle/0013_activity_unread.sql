CREATE TABLE message_reads (user TEXT NOT NULL, conversation TEXT NOT NULL, last_row INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(user,conversation));
CREATE TABLE activity_notifications (id INTEGER PRIMARY KEY AUTOINCREMENT,user TEXT NOT NULL,label TEXT NOT NULL,created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,read_at TEXT);
CREATE INDEX activity_notifications_user ON activity_notifications(user,read_at,id);
CREATE INDEX messages_conversation ON messages(conversation);
CREATE TRIGGER activity_credit AFTER INSERT ON ledger WHEN NEW.points>0 BEGIN
 INSERT INTO activity_notifications(user,label) VALUES(NEW.user,NEW.label||' · +'||NEW.points||' points');
END;
CREATE TRIGGER activity_buy AFTER INSERT ON market_requests BEGIN
 INSERT INTO activity_notifications(user,label) VALUES(NEW.seller,'New product buying request');
END;
CREATE TABLE point_transfers(id TEXT PRIMARY KEY,sender TEXT NOT NULL REFERENCES profiles(id),recipient TEXT NOT NULL REFERENCES profiles(id),points INTEGER NOT NULL CHECK(points>0 AND typeof(points)='integer'),label TEXT NOT NULL,CHECK(sender<>recipient));
CREATE TRIGGER point_transfer_atomic BEFORE INSERT ON point_transfers BEGIN
 SELECT CASE WHEN COALESCE((SELECT balance+bonus FROM profiles WHERE id=NEW.sender),0)<NEW.points THEN RAISE(ABORT,'Insufficient eCoin points.') END;
 INSERT INTO ledger(id,user,points,label,bucket) SELECT NEW.id||'-bonus-out',NEW.sender,-min(bonus,NEW.points),NEW.label,'bonus' FROM profiles WHERE id=NEW.sender AND bonus>0;
 INSERT INTO ledger(id,user,points,label,bucket) SELECT NEW.id||'-bonus-in',NEW.recipient,min(bonus,NEW.points),NEW.label,'bonus' FROM profiles WHERE id=NEW.sender AND bonus>0;
 INSERT INTO ledger(id,user,points,label,bucket) SELECT NEW.id||'-out',NEW.sender,-max(0,NEW.points-bonus),NEW.label,'withdrawable' FROM profiles WHERE id=NEW.sender AND bonus<NEW.points;
 INSERT INTO ledger(id,user,points,label,bucket) SELECT NEW.id||'-in',NEW.recipient,max(0,NEW.points-bonus),NEW.label,'withdrawable' FROM profiles WHERE id=NEW.sender AND bonus<NEW.points;
 UPDATE profiles SET balance=balance+max(0,NEW.points-(SELECT bonus FROM profiles WHERE id=NEW.sender)),bonus=bonus+min((SELECT bonus FROM profiles WHERE id=NEW.sender),NEW.points) WHERE id=NEW.recipient;
 UPDATE profiles SET balance=balance-max(0,NEW.points-bonus),bonus=max(0,bonus-NEW.points) WHERE id=NEW.sender;
END;
CREATE TABLE conversation_usage(conversation TEXT NOT NULL,user TEXT NOT NULL,texts INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(conversation,user));
CREATE TRIGGER message_text_charge BEFORE INSERT ON messages WHEN NEW.kind='text' BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM conversations WHERE id=NEW.conversation AND status='active' AND NEW.sender IN(starter,recipient)) THEN RAISE(ABORT,'Conversation is closed.') END;
 INSERT INTO conversation_usage(conversation,user,texts) VALUES(NEW.conversation,NEW.sender,1) ON CONFLICT(conversation,user) DO UPDATE SET texts=texts+1;
 INSERT INTO point_transfers(id,sender,recipient,points,label) SELECT 'text-'||NEW.conversation||'-'||NEW.sender||'-'||CAST(u.texts/1000 AS INTEGER),NEW.sender,CASE WHEN c.starter=NEW.sender THEN c.recipient ELSE c.starter END,4,'Text messages' FROM conversations c JOIN conversation_usage u ON u.conversation=c.id AND u.user=NEW.sender WHERE c.id=NEW.conversation AND u.texts%1000=0;
END;
