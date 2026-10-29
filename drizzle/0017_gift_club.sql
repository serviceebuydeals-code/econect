CREATE TABLE giftclub_events(id TEXT PRIMARY KEY,scheduled INTEGER NOT NULL,hours INTEGER NOT NULL CHECK(hours IN(1,2,4,8,15,30,50,100)),created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
ALTER TABLE live_bookings ADD COLUMN giftclub_event TEXT REFERENCES giftclub_events(id);
CREATE UNIQUE INDEX giftclub_member_once ON live_bookings(giftclub_event,user) WHERE giftclub_event IS NOT NULL;
CREATE TRIGGER giftclub_event_lock BEFORE UPDATE ON giftclub_events WHEN EXISTS(SELECT 1 FROM live_bookings WHERE giftclub_event=OLD.id) BEGIN
 SELECT RAISE(ABORT,'This event already has payment bookings. Create a new event instead.');
END;
CREATE TRIGGER giftclub_booking_validate BEFORE INSERT ON live_bookings WHEN NEW.giftclub_event IS NOT NULL BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM giftclub_events WHERE id=NEW.giftclub_event AND scheduled=NEW.scheduled AND hours=NEW.hours AND NEW.ends=scheduled+hours*3600000 AND scheduled>unixepoch()*1000) THEN RAISE(ABORT,'Gift Club schedule changed. Refresh and try again.') END;
END;
DROP TRIGGER live_wallet_charge;
CREATE TRIGGER live_wallet_charge BEFORE INSERT ON live_bookings WHEN NEW.source='wallet' AND NEW.giftclub_event IS NULL BEGIN
 SELECT CASE WHEN NEW.status<>'confirmed' OR COALESCE((SELECT balance+bonus FROM profiles WHERE id=NEW.user),0)<NEW.hours*100 THEN RAISE(ABORT,'Insufficient eCoin') END;
 INSERT INTO ledger(id,user,points,label,bucket) SELECT 'live-'||NEW.id||'-bonus',NEW.user,-min(bonus,NEW.hours*100),'Come Live booking','bonus' FROM profiles WHERE id=NEW.user AND bonus>0;
 INSERT INTO ledger(id,user,points,label,bucket) SELECT 'live-'||NEW.id||'-paid',NEW.user,-max(0,NEW.hours*100-bonus),'Come Live booking','withdrawable' FROM profiles WHERE id=NEW.user AND bonus<NEW.hours*100;
 UPDATE profiles SET balance=balance-max(0,NEW.hours*100-bonus),bonus=max(0,bonus-NEW.hours*100) WHERE id=NEW.user;
END;
CREATE TRIGGER giftclub_wallet_charge BEFORE INSERT ON live_bookings WHEN NEW.source='wallet' AND NEW.giftclub_event IS NOT NULL BEGIN
 SELECT CASE WHEN NEW.status<>'confirmed' OR COALESCE((SELECT balance FROM profiles WHERE id=NEW.user),0)<200 THEN RAISE(ABORT,'Insufficient eCoin') END;
 INSERT INTO ledger(id,user,points,label,bucket) VALUES('giftclub-'||NEW.id,NEW.user,-200,'Gift Club entry','withdrawable');
 UPDATE profiles SET balance=balance-200 WHERE id=NEW.user;
END;
DROP TRIGGER live_engagement_transfer;
CREATE TRIGGER live_engagement_transfer AFTER INSERT ON live_engagements BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM live_bookings WHERE id=NEW.booking AND (user<>NEW.sender OR NEW.kind='comment') AND status='confirmed' AND closed=0 AND scheduled<=unixepoch()*1000 AND ends>unixepoch()*1000 AND (user=NEW.sender OR heartbeat>unixepoch()*1000-45000)) THEN RAISE(ABORT,'Choose another creator who is currently live.') END;
 INSERT INTO point_transfers(id,sender,recipient,points,label) SELECT 'live-engagement-'||NEW.id,NEW.sender,user,20,CASE NEW.kind WHEN 'like' THEN 'Live like' ELSE 'Live comment' END FROM live_bookings WHERE id=NEW.booking AND user<>NEW.sender;
END;
