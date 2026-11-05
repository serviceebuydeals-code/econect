-- Charge future connected seconds at 0.4 points (2 points per 5 seconds).
-- Already charged amounts and completed call history remain unchanged.
UPDATE rtc_calls SET rate_hundredths=40 WHERE status!='ended';
