CREATE TABLE paystack_transactions (
 reference TEXT PRIMARY KEY,
 buyer TEXT NOT NULL REFERENCES profiles(id),
 kind TEXT NOT NULL CHECK(kind IN('payment','investment','promotion')),
 object_id TEXT NOT NULL,
 request_data TEXT NOT NULL,
 amount_kobo INTEGER NOT NULL CHECK(amount_kobo>0),
 currency TEXT NOT NULL DEFAULT 'NGN' CHECK(currency='NGN'),
 status TEXT NOT NULL DEFAULT 'initializing' CHECK(status IN('initializing','ready','paid')),
 checkout_url TEXT,
 created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 paid_at TEXT,
 UNIQUE(kind,object_id)
);
CREATE INDEX paystack_buyer ON paystack_transactions(buyer,created DESC);
CREATE TRIGGER paystack_confirm_validate BEFORE UPDATE OF status ON paystack_transactions WHEN OLD.status!='paid' AND NEW.status='paid' BEGIN
 SELECT CASE WHEN NEW.kind='payment' AND NOT EXISTS(SELECT 1 FROM payments WHERE id=NEW.object_id AND buyer=NEW.buyer AND status='pending' AND CAST(ROUND(amount_ngn*100) AS INTEGER)=NEW.amount_kobo) THEN RAISE(ABORT,'Paystack payment requires review.') END;
 SELECT CASE WHEN NEW.kind='investment' AND NOT EXISTS(SELECT 1 FROM investments WHERE id=NEW.object_id AND user=NEW.buyer AND source='bank' AND status='pending' AND CAST(ROUND(amount_ngn*100) AS INTEGER)=NEW.amount_kobo) THEN RAISE(ABORT,'Paystack investment requires review.') END;
 SELECT CASE WHEN NEW.kind='promotion' AND NOT EXISTS(SELECT 1 FROM market_promotions WHERE id=NEW.object_id AND seller=NEW.buyer AND source='bank' AND status='pending' AND CAST(ROUND(amount_ngn*100) AS INTEGER)=NEW.amount_kobo) THEN RAISE(ABORT,'Paystack promotion requires review.') END;
END;
CREATE TRIGGER paystack_confirm_payment AFTER UPDATE OF status ON paystack_transactions WHEN OLD.status!='paid' AND NEW.status='paid' AND NEW.kind='payment' BEGIN
 UPDATE payments SET status='confirmed',reference=NEW.reference WHERE id=NEW.object_id AND status='pending';
 INSERT INTO ledger(id,user,points,label,bucket) SELECT 'paystack-'||NEW.reference,recipient,coins*100,CASE kind WHEN 'topup' THEN 'Paystack wallet top-up' WHEN 'vote' THEN 'Paystack vote received' ELSE 'Paystack gift received' END,'withdrawable' FROM payments WHERE id=NEW.object_id;
 UPDATE profiles SET balance=balance+(SELECT coins*100 FROM payments WHERE id=NEW.object_id) WHERE id=(SELECT recipient FROM payments WHERE id=NEW.object_id);
 INSERT INTO votes(id,voter,contestant,coins) SELECT 'paystack-'||NEW.reference,buyer,recipient,coins FROM payments WHERE id=NEW.object_id AND kind='vote';
END;
CREATE TRIGGER paystack_confirm_investment AFTER UPDATE OF status ON paystack_transactions WHEN OLD.status!='paid' AND NEW.status='paid' AND NEW.kind='investment' BEGIN
 UPDATE investments SET status='confirmed',reference=NEW.reference,starts=CURRENT_TIMESTAMP,matures=datetime('now','+180 days') WHERE id=NEW.object_id AND status='pending';
END;
CREATE TRIGGER paystack_confirm_promotion AFTER UPDATE OF status ON paystack_transactions WHEN OLD.status!='paid' AND NEW.status='paid' AND NEW.kind='promotion' BEGIN
 UPDATE market_promotions SET status='confirmed',reference=NEW.reference,starts=CURRENT_TIMESTAMP,ends=datetime('now','+'||days||' days') WHERE id=NEW.object_id AND status='pending';
END;
