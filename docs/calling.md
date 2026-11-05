# eConect calling
Calls use dedicated rtc_calls and rtc_signals records, one authenticated participant-scoped call ID, incremental signaling, ICE buffering before the remote description, and short status polling independent of chat reads. No points are created or spent by these routes. One active call per participant; ringing expires after 60 seconds. Answer is atomic across devices. Active peers refresh presence through polling; abandoned calls expire after the other peer stops heartbeating.
The audio view has no blank video or dark video background. A persistent audio element plays remote audio; local/remote video is muted to prevent duplicate sound. Foreground ringtone/ringback uses Web Audio after a user gesture. Camera/mic access starts in parallel with config lookup. Tracks and timers stop on cancellation, errors, hangup and account changes.
Push uses the existing per-device encrypted Web Push queue. Incoming call alerts identify the caller and provide Open call/Decline actions where supported. Decline requires the signed-in recipient session. Expired and already-answered calls are suppressed at send time. Browser/OS settings control background sound; requireInteraction/vibration/actions are best-effort and are not native telephone ringing.

## Required relay setup
On Cloudflare, create a Realtime TURN key, then add Worker secrets TURN_KEY_ID and TURN_API_TOKEN. Never commit these values or send the long-lived token to the browser. /api/calls/config issues temporary ICE credentials through Cloudflare’s generate-ice-servers endpoint. No token means STUN-only fallback; some mobile/carrier NATs and firewalls will not connect without TURN. The app reports this on connection failure. Credentials expire after 24 hours; generation is capped per account.
Official setup: https://developers.cloudflare.com/realtime/turn/generate-credentials/
This change does not create/buy a TURN key or configure an account automatically.

## Closed-app ringtone limitation
Browser-installed Android/iPhone apps use Web Push. A service worker cannot run a continuous custom audio ringtone while the app is closed. Native-style ringing requires an Android native calling/notification integration and an iPhone native VoIP/CallKit integration, with their platform configuration and a rebuilt/released native app. The current WebView Android preview does not implement native background call delivery. This web update does not claim otherwise.
Refresh both participants' apps after deployment. Old cached pages use the previous chat-message signaling protocol.

## Validation
npm run check
npm run build
npm test
Use two real devices on different networks to verify audio/video and TURN relay connectivity after credentials are configured. Physical-device background sounds, permission prompts and network interoperability are not covered by simulated tests.
