# eConect

A social community app with a public feed, member profiles, messaging, reality TV, voting, and eCoin wallets. This repository targets **your own Cloudflare Workers account**, with D1 and R2. It does not require ChatGPT sign-in.

## Current implementation

- Email/password registration and login, hashed passwords, secure session cookies, logout, login throttling, and optional password-reset email through Resend.
- Profiles and compressed photos; one-minute feed video uploads with browser compression to below 5 MB. Some browsers cannot transcode; those users must supply a file already below the limit.
- Feed, comments/replies, one-time likes, and engagement points.
- **2 eCoin (200 points) non-withdrawable signup bonus**, awarded once when the profile is completed. Withdrawable and bonus balances are separate. Bonus-funded gifts and conversation payments remain bonus for the recipient; bonus is spent first.
- Wallet top-ups and gifts through configured bank transfers; credit happens after administrator confirmation. Wallet-funded gifts are also supported.
- **Voting requires a new bank payment**; wallet credit and signup bonus cannot be used. A confirmed vote credits the contestant and appears in recent voters.
- Admin-controlled logo, favicon, bank details, contestants, and up to 10 TV episodes (10 minutes each). Episode sharing includes poster metadata.
- Conversation text billing (4 points / 1,000 messages), voice notes (4 points / started minute), and WebRTC calls (4 points / started minute).

## Deployment status and limits

The code builds and passes accounting/authentication tests. It has **not yet been deployed to the owner's Cloudflare account**. Existing hosted data/media have not been exported or imported. A fresh D1 database starts empty.

The wallet labels an eligible balance as withdrawable; **cash withdrawal/payout processing is not implemented**. Bank verification is manual, not a connected payment gateway. Calls currently use polling-based signaling and a public STUN server; production reliability needs a TURN service and two-device testing. Background call ringing/push notifications and end-to-end encryption are not implemented. Do not market these as available yet. Email verification for ordinary accounts is not implemented; an admin account requires an additional private setup key. Location dropdowns cover selected countries/regions and offer manual entry for missing locations.

## Prerequisites

Node.js 22 or newer, a Cloudflare account with Workers/D1/R2 enabled, and this GitHub repository connected to Cloudflare. Use **Workers**, not a static-only Pages deployment.

## Local checks

```sh
npm ci
npm test
npm run check
npm run build
```

For local API development, create `.dev.vars` (ignored by Git) with `ADMIN_EMAIL`, `ADMIN_SETUP_KEY`, and optional email settings. Run `npm run db:local`, then `npm run dev`. The local frontend uses the Worker, not the old Sites preview.

## Cloudflare setup

1. Create D1 database `econect-db` and R2 bucket `econect-media` in Cloudflare. Keep the R2 bucket private: media is served through authenticated/public app routes as appropriate.
2. Copy the D1 database ID into `wrangler.jsonc`, replacing the placeholder ID. The logical bindings are `DB` and `BUCKET`.
3. Set `ADMIN_EMAIL` to the owner's email in `wrangler.jsonc` or a Cloudflare runtime override. Keep `ADMIN_SETUP_KEY` in **Cloudflare secrets**, never in GitHub. Generate a long random setup key and set it before allowing registrations.
4. Apply the database migrations once using `npm run db:remote`. Migrations live under `drizzle/`; preserve their order. Use Cloudflare's D1 console if working without a terminal, running each SQL file in order on a new database. The Drizzle `--> statement-breakpoint` markers are comments.
5. In Cloudflare **Workers & Pages**, create a Worker from this GitHub repository. Build command: `npm run build`. Deploy command: `npx wrangler deploy`. The `wrangler.jsonc` file describes the Worker and frontend assets. Node version: 22 or newer.
6. Add runtime secret `ADMIN_SETUP_KEY`. Optional reset-email secret: `RESEND_API_KEY`; optional variables: `EMAIL_FROM` (verified sender) and `APP_ORIGIN` (your HTTPS site origin).
7. Deploy and open the resulting `workers.dev` URL. Create the owner account using the configured `ADMIN_EMAIL` and the private admin setup key. Create a password in the site; do not send it in chat.
8. Finish the profile, open **Admin studio**, set bank details and branding, then upload TV content and choose contestants.
9. Test with a second account before enabling real payments. Connect a custom domain only after the Worker works correctly.

CLI equivalents for initial resource setup:

```sh
npx wrangler login
npx wrangler d1 create econect-db
npx wrangler r2 bucket create econect-media
# Edit wrangler.jsonc with the returned database ID and owner email.
npx wrangler secret put ADMIN_SETUP_KEY
npm run db:remote
npm run deploy
```

Workers Builds authentication/deploy permissions are managed by Cloudflare. No Cloudflare token or GitHub token belongs in source. Do not enable real-money transactions before payment, accounting, and call settlement testing.

## Existing account/data migration

The previous version used Sites-specific user IDs. Do not map accounts by an unverified email or give imported accounts arbitrary passwords. Back up the old D1 database and R2 media first; then use a reviewed ID mapping and verified account-claim/reset flow. Carry over both wallet buckets and the complete ledger. This repository preserves the existing application table schema but does not perform or pretend to perform that data transfer.

## Reference documentation

- https://developers.cloudflare.com/workers/static-assets/
- https://developers.cloudflare.com/workers/wrangler/configuration/
- https://developers.cloudflare.com/d1/reference/migrations/

## Main files

- `app/page.tsx`, `app/globals.css`: React interface and responsive styles
- `server/api.ts`: community, uploads, wallet, admin, and conversation APIs
- `server/auth.ts`: independent accounts, sessions, and password reset
- `server/worker.ts`: Worker routing, static assets, share metadata
- `drizzle/`: ordered database migrations
- `wrangler.jsonc`: Cloudflare resource bindings
- `scripts/`: accounting and authentication integration tests


## Marketplace, shops and promotion update

Apply `drizzle/0004_marketplace.sql` before using marketplace routes. For Workers Builds, set the deploy command to:

```sh
npm run deploy
```

The deployment script now builds, applies pending remote D1 migrations, then deploys the Worker. The existing build command can remain `npm run build`. Keep D1, R2 and runtime secrets configured as before. No private configuration is added to source.

- Public Marketplace navigation appears after Home. The initial listing contains the newest 600 active products. Search spans all products by name, category, subcategory and description, with pagination. Shops paginate their complete catalogue.
- Authenticated sellers upload 1–10 photos using the existing image compressor, plus name, NGN price, location and description. The server selects an existing main category from keyword rules if none is selected, and creates a subcategory from the product name when needed. This is a simple heuristic, not an AI classifier. Admin studio → Marketplace adds main/subcategories.
- Each successful listing costs 20 points, atomically debited bonus-first by a SQLite trigger with matching wallet ledger entries. Retrying the same listing ID cannot charge twice.
- Buy sends a free product request, visible in both accounts under marketplace requests and Notifications. It does not purchase the item or charge the buyer. Either party can start a conversation; the existing conversation starter remains its payer. Starting a new conversation requires at least 4 points. Product checkout, escrow, shipping and order fulfilment are not implemented.
- Profiles with active products have a visible Visit shop button. Shop folders only organize that seller's catalogue; they do not change public marketplace categories. Each folder uses its newest active product photo. Public /shop/username links render Open Graph metadata using the newest active product photo; social networks may cache previews.
- Shop promotion: 8 eCoin / 3 days, 15 / 7 days, 30 / 30 days. Product promotion: 2 / 3 days, 4 / 7 days, 8 / 30 days. Wallet payment is atomic and activates immediately. Direct payment uses existing bank details; it activates only after manual administrator bank verification in Admin studio → Marketplace. No external gateway or webhook is connected.
- Active campaigns may appear as labeled sponsored cards during up to 20 feed pages (20 posts each), with a server-enforced aggregate cap of 3 sponsored placements per signed-in member per Lagos calendar day. Actual delivery depends on available members, feed browsing and live campaigns; impressions or sales are not guaranteed.
- Product-category personalization and on-site retargeting are opt-in. Recommendations use interest signals from the last 90 days. Disabling personalization deletes saved interests. General ads are used otherwise. There is no third-party pixel, cross-site identifier or advertising-provider integration.
- Logged-out homepage search is hidden. Signed-in homepage search queries the database for profile names, usernames, post text/captions and hashtags rather than filtering only the bootstrap window.

Validation: `npm run check`, `npm run build`, `npm test` and a Wrangler deployment dry-run. Marketplace tests cover accounting rollback/idempotency, zero-balance requests, catalogue search beyond the 600-item window, private requests, shop organization, promotion confirmation and the daily ad cap. Live Cloudflare deployment, live payments and browser/device verification still require checking the deployed site.

Promotions automatically stop qualifying for sponsored placements at their exact stored expiry timestamp. The expiry test runs on every ad selection; it does not depend on a scheduled job or administrator action. The owner's campaign history shows expired campaigns as Ended. Automated tests verify that expired campaigns return no ad and create no impression.


## Admin eCoin pricing and Grow Your Wealth

Migration `0005_wealth_and_pricing.sql` is applied by the existing `npm run deploy` command. Keep that as the Workers Builds deployment command.

Admin studio → Settings sets the NGN price of 1 eCoin (default ₦1,500). One eCoin remains 100 points. New top-ups, gifts, votes, promotion bank payments and investment payments use this base price. Quoted bank payments retain their saved NGN amount after price changes. Stale client prices are rejected before creating new payment requests.

Grow Your Wealth appears immediately after Marketplace. Investment packages are 1, 2, 4, 8, 15, 30, 50, 100, 200, 400, 800, 1,500, 3,000, 5,000, 10,000 and 20,000 eCoin.

Both payment sources create a pending investment. A wallet investment reserves principal from the withdrawable balance only; bonus eCoin cannot be invested. Direct payment uses existing bank-transfer settings and an investment-specific reference. Admin studio → Investments confirms or rejects pending investments. Confirmation begins the 180-day term; rejecting a wallet investment refunds its principal exactly once.

The user selected early cashout:
- Before 180 days: principal minus a 5% fee; no interest.
- At/after 180 days: principal plus 10% interest, minus a 5% fee on that combined amount.
- Cashout credits the owner's withdrawable eConect wallet and closes the investment.
- Example for 1 eCoin: early cashout credits 95 points (0.95 eCoin); mature cashout credits 104.5 points (1.045 eCoin): 100 principal + 10 interest − 5.5 fee.

Fractional points are retained for these calculations and displayed in balances. SQLite's existing non-strict INTEGER balance/ledger columns accept fractional numeric values.

Tracking views show Successful (confirmed, before maturity), Pending (unconfirmed and rejected, clearly labeled), Completed (180 days reached, awaiting cashout), and Cashout (credited and closed). Countdown uses the server timestamp. Maturity is calculated on reads/cashout and does not depend on a daily job.

SQLite triggers reserve, refund and credit funds atomically with status transitions. Server-side rules enforce amounts. Per-investment ledger IDs and guarded status changes prevent duplicate cashouts or refunds.

This implements an internal eCoin ledger plan. No external investment portfolio, brokerage, yield source, bank withdrawal or automatic payment-verification provider is connected. The operator must fund any real-money liabilities represented by eCoin. Live Cloudflare deployment and account/device checks remain to be verified.

Validation: TypeScript, Vite production build, social/auth/marketplace tests, new pricing/investment tests, and Wrangler dry-run. Tests cover price permissions and existing quote preservation, bonus exclusion, principal reservation/refund, 180-day timing, early/mature payout math, concurrent cashout retries, private records, large packages and bank-payment lifecycle.

## Current investment rate: 15% for new investments

Migration 0006 preserves existing investment records and their agreed 10% interest, while enabling the new 15% plan. New investments now store 15 interest points per invested eCoin. The 180-day term and 5% cashout fee remain unchanged. Early cashout pays principal less 5%, without interest. At maturity, 1 eCoin pays 115 − 5.75 = 109.25 points (1.0925 eCoin) after the fee. Investment history, payout calculations and ledger labels use each record's stored rate. Tests cover both new 15% and migrated 10% investments.
