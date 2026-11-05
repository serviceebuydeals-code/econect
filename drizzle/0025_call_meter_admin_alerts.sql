-- Connected calls cost 20 points per completed second (1 eCoin / 5 seconds).
ALTER TABLE rtc_calls ADD COLUMN caller_connected INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rtc_calls ADD COLUMN recipient_connected INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rtc_calls ADD COLUMN connected_at INTEGER;
ALTER TABLE rtc_calls ADD COLUMN answered_at INTEGER;
ALTER TABLE rtc_calls ADD COLUMN billed_seconds INTEGER NOT NULL DEFAULT 0 CHECK(billed_seconds>=0);
ALTER TABLE rtc_calls ADD COLUMN end_reason TEXT NOT NULL DEFAULT '';
CREATE INDEX rtc_history_pair ON rtc_calls(caller,recipient,created);
CREATE TRIGGER rtc_meter_monotonic BEFORE UPDATE OF billed_seconds ON rtc_calls
 WHEN NEW.billed_seconds<OLD.billed_seconds BEGIN SELECT RAISE(ABORT,'Invalid call meter.'); END;
CREATE TRIGGER rtc_meter_transfer AFTER UPDATE OF billed_seconds ON rtc_calls
 WHEN NEW.billed_seconds>OLD.billed_seconds BEGIN
 INSERT INTO point_transfers(id,sender,recipient,points,label)
 VALUES('rtc-'||NEW.id||'-'||NEW.billed_seconds,NEW.caller,NEW.recipient,
 (NEW.billed_seconds-OLD.billed_seconds)*20,CASE NEW.video WHEN 1 THEN 'Video call' ELSE 'Audio call' END);
END;
-- One summary per call rather than a device alert every second.
DROP TRIGGER activity_credit;
CREATE TRIGGER activity_credit AFTER INSERT ON ledger WHEN NEW.points>0 AND NEW.label NOT IN('Audio call','Video call') BEGIN
 INSERT INTO activity_notifications(user,label,ledger_id) VALUES(NEW.user,NEW.label||' · +'||NEW.points||' points',NEW.id);
END;
CREATE TRIGGER rtc_finished AFTER UPDATE OF status ON rtc_calls WHEN OLD.status!='ended' AND NEW.status='ended' BEGIN
 INSERT INTO activity_notifications(user,label) VALUES(NEW.recipient,
 CASE WHEN NEW.connected_at IS NULL THEN CASE WHEN OLD.status='ringing' THEN 'Missed ' ELSE 'Unconnected ' END ELSE '' END
 ||CASE NEW.video WHEN 1 THEN 'video call' ELSE 'audio call' END||' from @'||(SELECT username FROM profiles WHERE id=NEW.caller)
 ||CASE WHEN NEW.connected_at IS NOT NULL THEN ' · '||NEW.billed_seconds||' seconds · earned '||printf('%.2f',NEW.billed_seconds/5.0)||' eCoin' ELSE '' END);
 INSERT INTO activity_notifications(user,label) SELECT NEW.caller,
 CASE WHEN NEW.connected_at IS NULL THEN 'Unanswered ' ELSE '' END
 ||CASE NEW.video WHEN 1 THEN 'video call' ELSE 'audio call' END||' to @'||(SELECT username FROM profiles WHERE id=NEW.recipient)
 ||CASE WHEN NEW.connected_at IS NOT NULL THEN ' · '||NEW.billed_seconds||' seconds · paid '||printf('%.2f',NEW.billed_seconds/5.0)||' eCoin' ELSE '' END;
END;
-- All administrator accounts receive their own unread/device notification.
CREATE TRIGGER admin_withdrawal_notice AFTER INSERT ON wallet_withdrawals BEGIN
 INSERT INTO activity_notifications(user,label)
 SELECT p.id,'Admin: new wallet withdrawal request from @'||(SELECT username FROM profiles WHERE id=NEW.user)||' · '||printf('%.4f',NEW.coin_units/10000.0)||' eCoin. Review Withdrawals in Admin studio.'
 FROM profiles p JOIN auth_users a ON a.id=p.id WHERE a.is_admin=1;
END;
CREATE TRIGGER admin_payment_notice AFTER UPDATE OF reference ON payments
 WHEN NEW.status='pending' AND NEW.reference!='' AND OLD.reference='' BEGIN
 INSERT INTO activity_notifications(user,label)
 SELECT p.id,'Admin: payment submitted by @'||(SELECT username FROM profiles WHERE id=NEW.buyer)||'. Review Payments in Admin studio.'
 FROM profiles p JOIN auth_users a ON a.id=p.id WHERE a.is_admin=1;
END;
CREATE TRIGGER admin_investment_notice AFTER UPDATE OF reference ON investments
 WHEN NEW.status='pending' AND NEW.reference!='' AND OLD.reference='' BEGIN
 INSERT INTO activity_notifications(user,label)
 SELECT p.id,'Admin: investment payment submitted by @'||(SELECT username FROM profiles WHERE id=NEW.user)||'. Review Investments in Admin studio.'
 FROM profiles p JOIN auth_users a ON a.id=p.id WHERE a.is_admin=1;
END;
CREATE TRIGGER admin_promotion_notice AFTER UPDATE OF reference ON market_promotions
 WHEN NEW.status='pending' AND NEW.reference!='' AND OLD.reference='' BEGIN
 INSERT INTO activity_notifications(user,label)
 SELECT p.id,'Admin: promotion payment submitted by @'||(SELECT username FROM profiles WHERE id=NEW.seller)||'. Review Marketplace in Admin studio.'
 FROM profiles p JOIN auth_users a ON a.id=p.id WHERE a.is_admin=1;
END;
