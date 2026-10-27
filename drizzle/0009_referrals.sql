-- Registration already lowercases usernames. This index also prevents case-only duplicates.
CREATE UNIQUE INDEX profiles_username_nocase ON profiles(username COLLATE NOCASE);
CREATE TABLE referral_programs (
 referrer TEXT PRIMARY KEY REFERENCES profiles(id),
 starts_on TEXT NOT NULL,
 expires_on TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN(0,1)),
 updated TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(starts_on<=expires_on)
);
CREATE TABLE referral_relationships (
 referred TEXT PRIMARY KEY REFERENCES profiles(id),
 referrer TEXT NOT NULL REFERENCES profiles(id),
 created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(referred!=referrer)
);
CREATE INDEX referral_relationships_referrer ON referral_relationships(referrer,created);
CREATE TRIGGER referral_relationship_validate BEFORE INSERT ON referral_relationships BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM referral_programs WHERE referrer=NEW.referrer AND enabled=1 AND starts_on<=date('now','+1 hours') AND expires_on>=date('now','+1 hours')) THEN RAISE(ABORT,'Referral code is not active. Check the code or leave it blank.') END;
END;
CREATE TRIGGER referral_relationship_immutable BEFORE UPDATE ON referral_relationships BEGIN
 SELECT RAISE(ABORT,'A referral can only be set during registration.');
END;
CREATE TABLE referral_rewards (
 id TEXT PRIMARY KEY,
 referrer TEXT NOT NULL REFERENCES profiles(id),
 referred TEXT NOT NULL REFERENCES profiles(id),
 source TEXT NOT NULL CHECK(source IN('payment','investment')),
 source_id TEXT NOT NULL,
 purchased_coins INTEGER NOT NULL CHECK(purchased_coins>0),
 points INTEGER NOT NULL CHECK(points=purchased_coins*5),
 created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(source,source_id)
);
CREATE INDEX referral_rewards_referrer ON referral_rewards(referrer,created DESC);
CREATE TRIGGER referral_credit AFTER INSERT ON referral_rewards BEGIN
 INSERT INTO ledger(id,user,points,label,bucket) VALUES('referral-'||NEW.id,NEW.referrer,NEW.points,'Referral reward · 5% of confirmed eCoin purchase','withdrawable');
 UPDATE profiles SET balance=balance+NEW.points WHERE id=NEW.referrer;
END;
CREATE TRIGGER referral_payment_reward AFTER UPDATE OF status ON payments WHEN OLD.status='pending' AND NEW.status='confirmed' BEGIN
 INSERT OR IGNORE INTO referral_rewards(id,referrer,referred,source,source_id,purchased_coins,points)
 SELECT 'payment-'||NEW.id,r.referrer,r.referred,'payment',NEW.id,NEW.coins,NEW.coins*5 FROM referral_relationships r JOIN referral_programs p ON p.referrer=r.referrer
 WHERE r.referred=NEW.buyer AND p.enabled=1 AND p.starts_on<=date('now','+1 hours') AND p.expires_on>=date('now','+1 hours');
END;
CREATE TRIGGER referral_investment_reward AFTER UPDATE OF status ON investments WHEN OLD.status='pending' AND NEW.status='confirmed' AND NEW.source='bank' BEGIN
 INSERT OR IGNORE INTO referral_rewards(id,referrer,referred,source,source_id,purchased_coins,points)
 SELECT 'investment-'||NEW.id,r.referrer,r.referred,'investment',NEW.id,NEW.coins,NEW.coins*5 FROM referral_relationships r JOIN referral_programs p ON p.referrer=r.referrer
 WHERE r.referred=NEW.user AND p.enabled=1 AND p.starts_on<=date('now','+1 hours') AND p.expires_on>=date('now','+1 hours');
END;
