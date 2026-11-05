# Device push notifications
Notifications → Enable notifications registers each device after a user gesture and OS permission. Test notification attempts delivery immediately and confirms provider acceptance. Provider errors and expired registrations are reported to the device owner; it does not claim device receipt. The minute cron handles retries and ordinary pending events.
Supported delivery: Chrome-installed Android PWA and Safari Home Screen apps on iOS 16.4+. The Android WebView preview APK does not implement PushManager and needs Firebase/native integration and a rebuilt APK. This web update does not add native Firebase.
Phone/browser notification settings, Focus/Do Not Disturb, connectivity and force-stopping the browser can prevent sound or delivery. No custom background ringtone or continuous native call screen is provided.

## Deployment
The normal deploy command applies D1 migrations before publishing. Wrangler declares the minute cron explicitly. No external push service API key is needed: a single P-256 VAPID signing pair is generated on the Worker, stored in the server-only push_keys table and reused across deployments. Only the public key is returned to authenticated clients. Preserve push_keys when migrating/backing up the database; changing its key requires device resubscription. Never expose private_key through administration APIs or logs.
Messages/voice/media/call offers and existing activity notifications create per-device delivery rows via D1 triggers. Successful POSTs kick delivery through waitUntil; cron handles pending work/retries independently of open clients. Delivery has an atomic 60-second lease, bounded fanout, retries for 429/5xx/network errors, 410/404 cleanup, read/ended-call suppression and retention cleanup.
Device registration accepts only known Apple/Google/Mozilla HTTPS push hosts and validates P-256/auth keys. Registration, status, disable and test routes require a logged-in session; writes require a same-origin Origin. A device cannot silently move between accounts. Log out removes the current device subscription before ending the session. Generic encrypted payloads keep message contents off lock screens. Notification taps open the relevant conversation after authentication.
The service worker handles only push/click lifecycle; it does not cache pages or intercept API/video requests.

## Verification
npm run check
npm run build
npm test
npx wrangler deploy --dry-run
After deployment, enable notifications from the installed PWA. Send a test and check the reported delivery result. Then close the app and send a message from a second account to verify background delivery. Send a message from another account, check the locked phone, and tap to verify conversation routing. Also check disabling notifications and logging out. Physical-device delivery and OS sound require this end-to-end test.

Outbound delivery uses Workers-supported redirect: manual. Redirect responses are terminal failures and never followed, preventing credentials or encrypted payloads from being forwarded to another origin. scripts/push-runtime.test.mjs executes the real delivery path in bundled workerd with a simulated push provider.
