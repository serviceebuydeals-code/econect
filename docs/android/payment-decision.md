# Android eCoin payment decision — 29 October 2026

Owner decision: preserve creator cash-out. This preparation does not convert existing balances, change the website economy, or enable real Android purchases. The Play version needs separate payment purposes rather than treating every eCoin balance as the same kind of money.

## Proposed payment rails

| Use | Proposed Android route | Current preparation status |
| --- | --- | --- |
| Buy live broadcasting time | Google Play one-time service product; verified purchase creates a live entitlement directly | Product specification below; checkout not enabled |
| Join Gift Club | Google Play event access product, tied to a server-issued event quote | Specification only; no active billing |
| Digital shop/post promotion | Google Play service product with a server-issued campaign quote | Preview blocks new promotion purchases |
| Buy general eCoin | Do not sell a cash-redeemable or transferable wallet balance through an unfinished Play integration | Preview blocks top-up checkout |
| Like/comment/gift with existing earned balance | Preserve current ledger accounting during internal testing; obtain classification review before a store release | Existing ledger unchanged; new gift checkout disabled |
| Creator cash-out | Separate verified earnings and existing withdrawal process; no automatic conversion of proposed Play credits into cash | Existing web-funded earnings/withdrawals retained |
| Direct monetary tips | Separate assessment; do not label the current gifted-coin/celebration/withdrawal-fee flow as exempt without review | Not enabled as an Android payment route |
| Physical marketplace goods | Separate physical-commerce checkout and declarations; never mix this with digital promotion billing | No new physical checkout built |
| Investment plan | Separate financial-product review and declarations | Not included in this Android preview |

Google's general rule puts in-app digital services and sold virtual currency under Play Billing, subject to applicable exceptions/programs. Its direct-tip exception has narrow conditions: the creator receives the entire contribution and the payer receives no digital benefit. Those conditions must be assessed against eConect's actual fees and features. Do not assume that using Paystack, calling a payment a gift, or opening a browser makes a digital purchase exempt.

Official policy sources:
- https://support.google.com/googleplay/android-developer/answer/10281818?hl=en-ID
- https://support.google.com/googleplay/android-developer/answer/18258653?rd=5
- https://support.google.com/googleplay/android-developer/answer/13849271?hl=en-en

## Proposed Play product catalog

Create products only after confirming package ownership, purpose and pricing. These IDs are proposals, not products already created in Play Console.

- `econect_live_1h`, `econect_live_2h`, `econect_live_4h`, `econect_live_8h`, `econect_live_15h`, `econect_live_30h`, `econect_live_50h`, `econect_live_100h`.
- `econect_giftclub_entry`: event entry. The backend binds a purchase intent to a specific scheduled event before checkout; a client cannot substitute an event afterward.
- Promotion IDs can follow the existing duration/package matrix after the first two purchase types are verified.

Display Google's localized product price. Do not calculate the charged Play price by multiplying the website's eCoin price. There are no live Play product IDs, keys or prices in the current app.

## Backend requirements before real billing

1. Authenticate the member and create an expiring purchase intent with product, schedule/event and owner. Use an obfuscated account identifier in the Play checkout.
2. Send the purchase token to the backend. Verify it with Google's API for the expected package/product, purchase state, quantity and bound account. Client success callbacks alone cannot credit anything.
3. Record the token uniquely and atomically grant only its quoted entitlement. A service purchase must not also credit the withdrawable wallet or trigger web referral rewards.
4. Consume/acknowledge on the server with retryable state. Handle pending/cancelled transactions without entitlements and recover interrupted purchases.
5. Integrate real-time notifications and voided/refunded purchase reconciliation; define entitlement reversal rules before launch.
6. Keep creator earnings, payout eligibility and settlement accounting independent of purchase credits. Document the actual funding and fees, and obtain payment-classification review for the cash-out model before enabling it in a released Play build.

Reference: https://developer.android.com/google/play/billing/security

Needed from the owner next: Play Console app/account, finalized application ID and publishing entity, approved product/pricing choices, and Google Cloud/Play API access configured directly in the appropriate consoles. Never paste service-account private keys into chat or source code. Use Cloudflare secrets for backend credentials when this integration is implemented.
