-- Link credit notifications to their ledger entry; attribution never changes balances.
ALTER TABLE activity_notifications ADD COLUMN ledger_id TEXT;
CREATE INDEX ledger_user_created_points ON ledger(user,created,points);
CREATE INDEX activity_ledger ON activity_notifications(ledger_id);
CREATE VIEW gift_ledger_senders AS
 SELECT incoming.id ledger_id,sender.user sender_id FROM ledger incoming JOIN ledger sender
 ON sender.id=CASE WHEN substr(incoming.id,-4)='in-b' THEN substr(incoming.id,1,length(incoming.id)-4)||'out-b' ELSE substr(incoming.id,1,length(incoming.id)-2)||'out' END
 WHERE incoming.points>0 AND incoming.label IN('eCoin gift','eCoin gift · bonus') AND sender.points<0
 UNION ALL
 SELECT l.id,p.buyer FROM ledger l JOIN payments p ON p.id=l.id WHERE l.points>0 AND p.kind='gift' AND p.recipient=l.user
 UNION ALL
 SELECT l.id,p.buyer FROM ledger l JOIN paystack_transactions t ON l.id='paystack-'||t.reference AND t.kind='payment' JOIN payments p ON p.id=t.object_id WHERE l.points>0 AND p.kind='gift' AND p.recipient=l.user
 UNION ALL
 SELECT l.id,t.sender FROM ledger l JOIN point_transfers t ON l.id IN(t.id||'-bonus-in',t.id||'-in') WHERE l.points>0 AND t.label='Live gift' AND l.user=t.recipient;
-- Historical matches are only linked when the ledger record is unambiguous.
UPDATE activity_notifications SET ledger_id=(
 SELECT min(l.id) FROM ledger l WHERE l.user=activity_notifications.user AND l.created=activity_notifications.created
 AND activity_notifications.label=l.label||' · +'||l.points||' points' AND l.points>0 HAVING count(*)=1
) WHERE ledger_id IS NULL;
DROP TRIGGER activity_credit;
CREATE TRIGGER activity_credit AFTER INSERT ON ledger WHEN NEW.points>0 BEGIN
 INSERT INTO activity_notifications(user,label,ledger_id) VALUES(NEW.user,NEW.label||' · +'||NEW.points||' points',NEW.id);
END;
