# Desktop Buddy 0.27.3

- macOS releases now use a persistent internal app-signing certificate instead of an ad-hoc identity tied to each binary. A local A → B replacement test on macOS 27.0.1 retained Accessibility and continued receiving activity without granting access again.
- The first transition from an older ad-hoc release may require one Accessibility approval. Subsequent releases must use the same certificate. User revocation, a changed signing identity or operating-system policy can still require approval.
- The Mac build pins the reviewed public certificate and verifies the app's certificate-bound designated requirement before packaging. A missing or different signing identity fails the release instead of silently reverting to ad-hoc signing.
- Privacy settings dismiss obsolete permission instructions once access is granted. Regression tests confirm that tracking ON and OFF survive database reopen and application restart, and that Windows does not invoke macOS permission APIs.

This is internal code signing, not Apple Developer ID signing or Apple notarization. A first browser-downloaded installation may still require macOS's Open Anyway flow. No certificate authority was added to system trust, and no system-wide protection was disabled.

The common release includes Windows x64 and Mac Apple Silicon (macOS 14.5+). Existing Tauri updater keys, verification and Windows compatibility bridges are unchanged. Goals, chats, memory and provider keys are retained; there are no database migrations.
