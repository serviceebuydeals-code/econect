# eConect Android preparation

Status: internal preview source project, not a Play-ready app. No signed APK or AAB has been produced here. Release variants are intentionally disabled. The existing website remains the backend and is loaded over its own HTTPS origin, so its secure session cookies do not need to be exposed to a native bridge.

## Open and build

1. Install Android Studio from https://developer.android.com/studio and review its SDK terms yourself.
2. Open this `android` directory, not the repository root.
3. Use JDK 17 and install Android SDK Platform 36 plus the SDK build tools requested by Android Studio.
4. Let Gradle sync. On Windows run `gradlew.bat :app:assembleDebug`; on macOS/Linux run `./gradlew :app:assembleDebug` from this directory.
5. Debug output: `app/build/outputs/apk/debug/app-debug.apk`. Install only for internal testing.

Application ID `com.econectapp.android` is provisional and must be finalized before the first Play upload. Name: eConect. Minimum Android API: 26. Target/compile API: 36. AGP: 8.11.1, Gradle: 8.13. The bundled Gradle wrapper comes from Gradle v8.13.0; its license is in `gradle/wrapper/LICENSE.txt`. The Gradle distribution checksum is pinned.

## Implemented in this preview

- First-party HTTPS WebView, persistent sign-in, device Back handling and system-bar/keyboard insets.
- System document picker for image/video uploads, without blanket photo-library permissions.
- Camera/microphone permission requests restricted to the eConect origin and granted resources only.
- No JavaScript-to-native money bridge, no embedded credentials, no cleartext or ignored SSL errors.
- Preview user agent `eConectPlayPreview/0.1`; the web bootstrap hides digital purchase/Investment entry points, and the Worker rejects external checkout/promotion/investment APIs for this preview. This marker controls distribution UX only; it is not authentication or a billing security mechanism.
- Existing creator balances/withdrawal logic remains separate. No balance migration or Play-funded creator crediting is performed.

Not implemented: native Google Play checkout, receipt verification/consumption, refund reconciliation, FCM push/background call ringing, native share handling, offline UX, moderation/account deletion completion, signed release or store submission. These are release blockers, not completed features.

See [payment decision](../docs/android/payment-decision.md) and [release checklist](../docs/android/release-checklist.md).
