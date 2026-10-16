# Desktop Buddy 0.33.1

## Fixed

- AI Services now checks Nebius authentication and configured model availability, and Tavily authentication, automatically at workspace startup. Each indicator stays neutral while checking, then uses the backend's actual result. The probes send no goal text, generation request or search query.
- Network reconnection starts another check. Ordinary focus changes and local status polling do not call providers. Startup requests are deduplicated under React StrictMode; onboarding and mock providers do not make these requests.
- Choosing a companion color saves it immediately. A backend event updates both windows, including the companion toolbar, without waiting for the three-second dashboard poll. Other settings drafts are kept for their existing Save action. Invalid colors are rejected and failed writes are reported.

## Availability and limits

One version for Windows x64 and Apple Silicon macOS 14.5+. No Intel Mac build. Existing app signing, updater trust and credential helper are preserved.

Connection status confirms authentication/model listing only. It does not prove that generation billing or Tavily search succeeds. System credential prompts, if needed, still require the user to respond in macOS.
