CREATE TABLE market_shops (seller TEXT PRIMARY KEY REFERENCES profiles(id),phone TEXT NOT NULL DEFAULT '',updated TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE chat_media_uploads (
 key TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES profiles(id),conversation TEXT NOT NULL REFERENCES conversations(id),
 media_type TEXT NOT NULL CHECK(media_type IN('image','video')),url TEXT NOT NULL UNIQUE,used_message TEXT UNIQUE,
 created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER chat_media_transfer BEFORE INSERT ON messages WHEN NEW.kind IN('image','video') BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM conversations c WHERE c.id=NEW.conversation AND c.status='active' AND c.starter<>c.recipient AND NEW.sender IN(c.starter,c.recipient)) THEN RAISE(ABORT,'Start the conversation before sending media.') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM chat_media_uploads u WHERE u.owner=NEW.sender AND u.conversation=NEW.conversation AND u.media_type=NEW.kind AND u.url=NEW.body AND u.used_message IS NULL) THEN RAISE(ABORT,'Invalid or already sent media.') END;
 SELECT CASE WHEN COALESCE((SELECT balance+bonus FROM profiles WHERE id=NEW.sender),0)<CASE NEW.kind WHEN 'image' THEN 1 ELSE 4 END THEN RAISE(ABORT,'Insufficient eCoin points to send this media.') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM conversations c JOIN profiles p ON p.id=NEW.sender WHERE c.id=NEW.conversation AND c.starter=NEW.sender AND p.balance+p.bonus<(CASE NEW.kind WHEN 'image' THEN 1 ELSE 4 END)+4*CAST(c.texts/1000 AS INTEGER)+4*CAST((c.seconds+59)/60 AS INTEGER)) THEN RAISE(ABORT,'Keep enough points to settle the conversation before sending media.') END;
 INSERT INTO ledger(id,user,points,label,bucket) SELECT NEW.id||'-bonus-out',NEW.sender,-min(bonus,CASE NEW.kind WHEN 'image' THEN 1 ELSE 4 END),'Sent '||NEW.kind||' message','bonus' FROM profiles WHERE id=NEW.sender AND bonus>0;
 INSERT INTO ledger(id,user,points,label,bucket) SELECT NEW.id||'-bonus-in',CASE WHEN c.starter=NEW.sender THEN c.recipient ELSE c.starter END,min(p.bonus,CASE NEW.kind WHEN 'image' THEN 1 ELSE 4 END),'Received '||NEW.kind||' message','bonus' FROM conversations c JOIN profiles p ON p.id=NEW.sender WHERE c.id=NEW.conversation AND p.bonus>0;
 INSERT INTO ledger(id,user,points,label,bucket) SELECT NEW.id||'-regular-out',NEW.sender,-max(0,(CASE NEW.kind WHEN 'image' THEN 1 ELSE 4 END)-bonus),'Sent '||NEW.kind||' message','withdrawable' FROM profiles WHERE id=NEW.sender AND bonus<(CASE NEW.kind WHEN 'image' THEN 1 ELSE 4 END);
 INSERT INTO ledger(id,user,points,label,bucket) SELECT NEW.id||'-regular-in',CASE WHEN c.starter=NEW.sender THEN c.recipient ELSE c.starter END,max(0,(CASE NEW.kind WHEN 'image' THEN 1 ELSE 4 END)-p.bonus),'Received '||NEW.kind||' message','withdrawable' FROM conversations c JOIN profiles p ON p.id=NEW.sender WHERE c.id=NEW.conversation AND p.bonus<(CASE NEW.kind WHEN 'image' THEN 1 ELSE 4 END);
 UPDATE profiles SET balance=balance+max(0,(CASE NEW.kind WHEN 'image' THEN 1 ELSE 4 END)-(SELECT bonus FROM profiles WHERE id=NEW.sender)),bonus=bonus+min((SELECT bonus FROM profiles WHERE id=NEW.sender),CASE NEW.kind WHEN 'image' THEN 1 ELSE 4 END) WHERE id=(SELECT CASE WHEN starter=NEW.sender THEN recipient ELSE starter END FROM conversations WHERE id=NEW.conversation);
 UPDATE profiles SET balance=balance-max(0,(CASE NEW.kind WHEN 'image' THEN 1 ELSE 4 END)-bonus),bonus=max(0,bonus-(CASE NEW.kind WHEN 'image' THEN 1 ELSE 4 END)) WHERE id=NEW.sender;
 UPDATE chat_media_uploads SET used_message=NEW.id WHERE url=NEW.body AND owner=NEW.sender AND conversation=NEW.conversation;
END;
