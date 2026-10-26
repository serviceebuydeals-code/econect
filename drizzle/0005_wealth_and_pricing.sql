ALTER TABLE payments ADD COLUMN amount_ngn REAL;
UPDATE payments SET amount_ngn=coins*1500 WHERE amount_ngn IS NULL;
ALTER TABLE market_promotions ADD COLUMN amount_ngn REAL;
UPDATE market_promotions SET amount_ngn=coins*1500 WHERE amount_ngn IS NULL;
CREATE TABLE investments (
 id TEXT PRIMARY KEY,
 user TEXT NOT NULL REFERENCES profiles(id),
 coins INTEGER NOT NULL CHECK(coins IN(1,2,4,8,15,30,50,100,200,400,800,1500,3000,5000,10000,20000)),
 principal_points INTEGER NOT NULL CHECK(principal_points=coins*100),
 interest_points INTEGER NOT NULL CHECK(interest_points=coins*10),
 term_days INTEGER NOT NULL DEFAULT 180 CHECK(term_days=180),
 unit_price REAL NOT NULL CHECK(unit_price>0),
 amount_ngn REAL NOT NULL CHECK(amount_ngn>0),
 source TEXT NOT NULL CHECK(source IN('wallet','bank')),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','confirmed','cashed_out','rejected')),
 reference TEXT NOT NULL DEFAULT '',
 created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 starts TEXT,
 matures TEXT,
 cashed_out TEXT,
 fee_points REAL,
 payout_points REAL
);
CREATE INDEX investments_user_status ON investments(user,status,created);
CREATE INDEX investments_pending ON investments(status,created);
CREATE TRIGGER investment_insert_pending BEFORE INSERT ON investments BEGIN
 SELECT CASE WHEN NEW.status!='pending' THEN RAISE(ABORT,'New investments must await payment confirmation.') END;
END;
CREATE TRIGGER investment_reserve_wallet BEFORE INSERT ON investments WHEN NEW.source='wallet' BEGIN
 SELECT CASE WHEN COALESCE((SELECT balance FROM profiles WHERE id=NEW.user),0)<NEW.principal_points THEN RAISE(ABORT,'Insufficient withdrawable eCoin. Bonus eCoin cannot be invested.') END;
 INSERT INTO ledger(id,user,points,label,bucket) VALUES('investment-lock-'||NEW.id,NEW.user,-NEW.principal_points,'Investment principal reserved · pending confirmation','withdrawable');
 UPDATE profiles SET balance=balance-NEW.principal_points WHERE id=NEW.user;
END;
CREATE TRIGGER investment_transition BEFORE UPDATE OF status ON investments WHEN NEW.status!=OLD.status BEGIN
 SELECT CASE WHEN NOT ((OLD.status='pending' AND NEW.status IN('confirmed','rejected')) OR (OLD.status='confirmed' AND NEW.status='cashed_out')) THEN RAISE(ABORT,'Invalid investment status change.') END;
 SELECT CASE WHEN NEW.status='confirmed' AND (NEW.starts IS NULL OR NEW.matures IS NULL OR NEW.matures!=datetime(NEW.starts,'+180 days')) THEN RAISE(ABORT,'The investment term must be 180 days.') END;
 SELECT CASE WHEN NEW.status='cashed_out' AND (NEW.cashed_out IS NULL OR NEW.fee_points IS NULL OR NEW.payout_points IS NULL OR NEW.fee_points!=(OLD.principal_points+CASE WHEN OLD.matures<=CURRENT_TIMESTAMP THEN OLD.interest_points ELSE 0 END)/20.0 OR NEW.payout_points!=(OLD.principal_points+CASE WHEN OLD.matures<=CURRENT_TIMESTAMP THEN OLD.interest_points ELSE 0 END)*19.0/20) THEN RAISE(ABORT,'Incorrect investment cashout calculation.') END;
END;
CREATE TRIGGER investment_refund_wallet AFTER UPDATE OF status ON investments WHEN OLD.status='pending' AND NEW.status='rejected' AND OLD.source='wallet' BEGIN
 INSERT INTO ledger(id,user,points,label,bucket) VALUES('investment-refund-'||NEW.id,NEW.user,NEW.principal_points,'Investment declined · principal refunded','withdrawable');
 UPDATE profiles SET balance=balance+NEW.principal_points WHERE id=NEW.user;
END;
CREATE TRIGGER investment_cashout_wallet AFTER UPDATE OF status ON investments WHEN OLD.status='confirmed' AND NEW.status='cashed_out' BEGIN
 INSERT INTO ledger(id,user,points,label,bucket) VALUES('investment-cashout-'||NEW.id,NEW.user,NEW.payout_points,CASE WHEN OLD.matures<=CURRENT_TIMESTAMP THEN 'Investment cashout · principal + 10% interest less 5% fee' ELSE 'Early investment cashout · principal less 5% fee' END,'withdrawable');
 UPDATE profiles SET balance=balance+NEW.payout_points WHERE id=NEW.user;
END;
