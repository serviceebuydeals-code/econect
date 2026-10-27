CREATE TABLE wallet_withdrawals (
 id TEXT PRIMARY KEY,
 user TEXT NOT NULL REFERENCES profiles(id),
 coin_units INTEGER NOT NULL CHECK(coin_units>0),
 price_kobo INTEGER NOT NULL CHECK(price_kobo>0),
 gross_kobo INTEGER NOT NULL CHECK(gross_kobo>=10 AND gross_kobo<=100000000000000 AND gross_kobo=CAST((coin_units*price_kobo+5000)/10000 AS INTEGER)),
 fee_kobo INTEGER NOT NULL CHECK(fee_kobo=CAST((gross_kobo+5)/10 AS INTEGER)),
 net_kobo INTEGER NOT NULL CHECK(net_kobo=gross_kobo-fee_kobo),
 bank_name TEXT NOT NULL,
 account_name TEXT NOT NULL,
 account_number TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','processing','paid','rejected')),
 created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 completed TEXT,
 admin_user TEXT,
 transfer_reference TEXT NOT NULL DEFAULT ''
);
CREATE INDEX wallet_withdrawals_user ON wallet_withdrawals(user,created DESC);
CREATE INDEX wallet_withdrawals_status ON wallet_withdrawals(status,created DESC);
CREATE TRIGGER withdrawal_reserve BEFORE INSERT ON wallet_withdrawals BEGIN
 SELECT CASE WHEN NEW.status!='pending' THEN RAISE(ABORT,'A new withdrawal must start as pending.') END;
 SELECT CASE WHEN COALESCE((SELECT ROUND(balance*100) FROM profiles WHERE id=NEW.user),0)<NEW.coin_units THEN RAISE(ABORT,'Insufficient withdrawable eCoin. Bonus eCoin cannot be withdrawn.') END;
 INSERT INTO ledger(id,user,points,label,bucket) VALUES('withdrawal-reserve-'||NEW.id,NEW.user,-NEW.coin_units/100.0,'Bank withdrawal requested · 10% admin fee','withdrawable');
 UPDATE profiles SET balance=ROUND(balance-NEW.coin_units/100.0,2) WHERE id=NEW.user;
END;
CREATE TRIGGER withdrawal_transition BEFORE UPDATE OF status ON wallet_withdrawals WHEN NEW.status!=OLD.status BEGIN
 SELECT CASE WHEN NOT ((OLD.status='pending' AND NEW.status IN('processing','rejected')) OR (OLD.status='processing' AND NEW.status IN('pending','paid','rejected'))) THEN RAISE(ABORT,'Invalid withdrawal status change.') END;
 SELECT CASE WHEN NEW.status='processing' AND NEW.admin_user IS NULL THEN RAISE(ABORT,'A processing withdrawal must have an assigned administrator.') END;
 SELECT CASE WHEN NEW.status='paid' AND (NEW.admin_user IS NULL OR NEW.completed IS NULL OR NEW.transfer_reference='') THEN RAISE(ABORT,'Add the bank transfer reference before marking paid.') END;
END;
CREATE TRIGGER withdrawal_refund AFTER UPDATE OF status ON wallet_withdrawals WHEN OLD.status IN('pending','processing') AND NEW.status='rejected' BEGIN
 INSERT INTO ledger(id,user,points,label,bucket) VALUES('withdrawal-refund-'||NEW.id,NEW.user,NEW.coin_units/100.0,'Bank withdrawal cancelled or declined · eCoin returned','withdrawable');
 UPDATE profiles SET balance=ROUND(balance+NEW.coin_units/100.0,2) WHERE id=NEW.user;
END;
