CREATE TABLE live_engagements (
 id TEXT PRIMARY KEY,
 booking TEXT NOT NULL REFERENCES live_bookings(id),
 sender TEXT NOT NULL REFERENCES profiles(id),
 kind TEXT NOT NULL CHECK(kind IN ('like','comment')),
 text TEXT NOT NULL DEFAULT '' CHECK(length(text)<=500 AND (kind<>'comment' OR length(trim(text))>0)),
 created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX live_like_once ON live_engagements(booking,sender) WHERE kind='like';
CREATE INDEX live_engagement_booking ON live_engagements(booking,created);
CREATE TRIGGER live_engagement_transfer AFTER INSERT ON live_engagements BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM live_bookings WHERE id=NEW.booking AND user<>NEW.sender AND status='confirmed' AND closed=0 AND scheduled<=unixepoch()*1000 AND ends>unixepoch()*1000 AND heartbeat>unixepoch()*1000-45000) THEN RAISE(ABORT,'Choose another creator who is currently live.') END;
 INSERT INTO point_transfers(id,sender,recipient,points,label) SELECT 'live-engagement-'||NEW.id,NEW.sender,user,20,CASE NEW.kind WHEN 'like' THEN 'Live like' ELSE 'Live comment' END FROM live_bookings WHERE id=NEW.booking;
END;
