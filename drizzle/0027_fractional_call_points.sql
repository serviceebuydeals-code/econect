-- Preserve historical payments; future connected seconds cost 0.04 points.
ALTER TABLE rtc_calls ADD COLUMN rate_hundredths INTEGER NOT NULL DEFAULT 2000 CHECK(rate_hundredths>0);
ALTER TABLE rtc_calls ADD COLUMN charged_hundredths INTEGER NOT NULL DEFAULT 0 CHECK(charged_hundredths>=0);
UPDATE rtc_calls SET charged_hundredths=billed_seconds*2000;
UPDATE rtc_calls SET rate_hundredths=4 WHERE status!='ended';
CREATE TABLE rtc_call_charges(id TEXT PRIMARY KEY,call_id TEXT NOT NULL REFERENCES rtc_calls(id),hundredths INTEGER NOT NULL CHECK(hundredths>0 AND typeof(hundredths)='integer'));
CREATE INDEX rtc_charge_call ON rtc_call_charges(call_id);
-- Integer hundredths keep fractional call charging separate from whole-point interactions.
CREATE TRIGGER rtc_charge_atomic BEFORE INSERT ON rtc_call_charges BEGIN
 SELECT CASE WHEN (SELECT CAST(round((p.balance+p.bonus)*100) AS INTEGER) FROM profiles p JOIN rtc_calls c ON p.id=c.caller WHERE c.id=NEW.call_id)<NEW.hundredths THEN RAISE(ABORT,'Insufficient eCoin points.') END;
 INSERT INTO ledger(id,user,points,label,bucket)
 SELECT NEW.id||'-bonus-out',c.caller,-min(CAST(round(p.bonus*100) AS INTEGER),NEW.hundredths)/100.0,CASE c.video WHEN 1 THEN 'Video call' ELSE 'Audio call' END,'bonus' FROM rtc_calls c JOIN profiles p ON p.id=c.caller WHERE c.id=NEW.call_id AND p.bonus>0;
 INSERT INTO ledger(id,user,points,label,bucket)
 SELECT NEW.id||'-bonus-in',c.recipient,min(CAST(round(p.bonus*100) AS INTEGER),NEW.hundredths)/100.0,CASE c.video WHEN 1 THEN 'Video call' ELSE 'Audio call' END,'bonus' FROM rtc_calls c JOIN profiles p ON p.id=c.caller WHERE c.id=NEW.call_id AND p.bonus>0;
 INSERT INTO ledger(id,user,points,label,bucket)
 SELECT NEW.id||'-out',c.caller,-max(0,NEW.hundredths-CAST(round(p.bonus*100) AS INTEGER))/100.0,CASE c.video WHEN 1 THEN 'Video call' ELSE 'Audio call' END,'withdrawable' FROM rtc_calls c JOIN profiles p ON p.id=c.caller WHERE c.id=NEW.call_id AND CAST(round(p.bonus*100) AS INTEGER)<NEW.hundredths;
 INSERT INTO ledger(id,user,points,label,bucket)
 SELECT NEW.id||'-in',c.recipient,max(0,NEW.hundredths-CAST(round(p.bonus*100) AS INTEGER))/100.0,CASE c.video WHEN 1 THEN 'Video call' ELSE 'Audio call' END,'withdrawable' FROM rtc_calls c JOIN profiles p ON p.id=c.caller WHERE c.id=NEW.call_id AND CAST(round(p.bonus*100) AS INTEGER)<NEW.hundredths;
 UPDATE profiles SET balance=round(balance+(SELECT max(0,NEW.hundredths-CAST(round(p.bonus*100) AS INTEGER))/100.0 FROM rtc_calls c JOIN profiles p ON p.id=c.caller WHERE c.id=NEW.call_id),2),bonus=round(bonus+(SELECT min(NEW.hundredths,CAST(round(p.bonus*100) AS INTEGER))/100.0 FROM rtc_calls c JOIN profiles p ON p.id=c.caller WHERE c.id=NEW.call_id),2) WHERE id=(SELECT recipient FROM rtc_calls WHERE id=NEW.call_id);
 UPDATE profiles SET balance=round(balance-max(0,NEW.hundredths-CAST(round(bonus*100) AS INTEGER))/100.0,2),bonus=round(max(0,CAST(round(bonus*100) AS INTEGER)-NEW.hundredths)/100.0,2) WHERE id=(SELECT caller FROM rtc_calls WHERE id=NEW.call_id);
END;
DROP TRIGGER rtc_meter_transfer;
CREATE TRIGGER rtc_meter_transfer AFTER UPDATE OF billed_seconds ON rtc_calls WHEN NEW.billed_seconds>OLD.billed_seconds BEGIN
 SELECT CASE WHEN NEW.charged_hundredths!=OLD.charged_hundredths+(NEW.billed_seconds-OLD.billed_seconds)*NEW.rate_hundredths THEN RAISE(ABORT,'Invalid call charge.') END;
 INSERT INTO rtc_call_charges(id,call_id,hundredths) VALUES('rtc-'||NEW.id||'-'||NEW.billed_seconds,NEW.id,NEW.charged_hundredths-OLD.charged_hundredths);
END;
DROP TRIGGER rtc_finished;
CREATE TRIGGER rtc_finished AFTER UPDATE OF status ON rtc_calls WHEN OLD.status!='ended' AND NEW.status='ended' BEGIN
 INSERT INTO activity_notifications(user,label) VALUES(NEW.recipient,
 CASE WHEN NEW.connected_at IS NULL THEN CASE WHEN OLD.status='ringing' THEN 'Missed ' ELSE 'Unconnected ' END ELSE '' END
 ||CASE NEW.video WHEN 1 THEN 'video call' ELSE 'audio call' END||' from @'||(SELECT username FROM profiles WHERE id=NEW.caller)
 ||CASE WHEN NEW.connected_at IS NOT NULL THEN ' · '||NEW.billed_seconds||' seconds · earned '||printf('%.2f',NEW.charged_hundredths/100.0)||' points' ELSE '' END);
 INSERT INTO activity_notifications(user,label) SELECT NEW.caller,
 CASE WHEN NEW.connected_at IS NULL THEN 'Unanswered ' ELSE '' END
 ||CASE NEW.video WHEN 1 THEN 'video call' ELSE 'audio call' END||' to @'||(SELECT username FROM profiles WHERE id=NEW.recipient)
 ||CASE WHEN NEW.connected_at IS NOT NULL THEN ' · '||NEW.billed_seconds||' seconds · paid '||printf('%.2f',NEW.charged_hundredths/100.0)||' points' ELSE '' END;
END;
