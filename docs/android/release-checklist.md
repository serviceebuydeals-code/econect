# eConect Android release checklist

This project is NOT ready to submit. No store approval or payment-policy clearance is implied by the preview.

## Account and signing

- [ ] Register/verify the Play Console account and publishing entity.
- [ ] Finalize the application ID; configure Play App Signing and protect the upload key outside git.
- [ ] Complete any account-specific device/closed-testing requirements shown in Play Console.
- [ ] Build and install a debug APK; test on a physical Android device and current Android System WebView.

## Payment release gates

- [ ] Confirm the cash-out/payment classification and country availability with qualified review/Google support.
- [ ] Implement native supported Play Billing, server purchase verification, token deduplication, consumption/acknowledgement, pending purchases, refunds and reconciliation.
- [ ] Configure and license-test actual service products, scheduled booking collisions and expired event quotes.
- [ ] Show accurate Play prices and ensure no forbidden external digital checkout or purchase link can be reached from the Android app.
- [ ] Complete Financial features declarations for the actual wallet/payout features and any required supporting information.
- [ ] Keep Investment unavailable unless separately reviewed and eligible.

## Social app and privacy release gates

- [ ] In-app reporting of users/content, user blocking, moderation queue, enforcement and accessible support.
- [ ] Terms acceptance, age/content rating and social-app child-safety requirements for the actual audience.
- [ ] In-app account deletion and a functional public deletion-request page, with clear retention rules for necessary financial records.
- [ ] Publish a real privacy policy and complete Data safety accurately for messages, uploads, calls, identifiers and payment information.
- [ ] Supply reviewer credentials and clear review instructions without weakening authentication.

## Device acceptance tests

- [ ] Registration, login, logout, password reset and session persistence across app restarts.
- [ ] Back through pages, dialogs, messages, video editor, live full screen and Home.
- [ ] Photo/video picker, trim, thumbnail, caption, 10 MB compression, upload progress, retry and playback with audio.
- [ ] Camera/microphone grant, deny and revoke; live/call start/stop and rotation.
- [ ] Android 16 edge-to-edge layout, keyboard insets, accessibility and slow/offline connections.
- [ ] Native sharing and notification/background delivery if advertised. FCM/background call notifications are not implemented in this preparation.

Only after all applicable gates are complete should release variants be enabled and a signed AAB generated. The current Gradle project deliberately disables release variants.

Official references reviewed 29 October 2026:
- Target API: https://developer.android.com/google/play/requirements/target-sdk
- Social content: https://support.google.com/googleplay/android-developer/answer/9876937?hl=en
- Account deletion: https://support.google.com/googleplay/android-developer/answer/13327111?hl=en-en
- Financial declarations: https://support.google.com/googleplay/android-developer/answer/13849271?hl=en-en
- New personal-account testing: https://support.google.com/googleplay/android-developer/answer/14151465?hl=en
