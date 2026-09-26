# Validation record

## Desktop companion — 0.2.0

Implemented persistent display preferences, a transparent draggable companion, a 45-second expanded card, pause/DND suppression, and opt-in Nebius-to-Tavily suggestions with a 15-minute attempt interval. Search query validation, stale consent/session rejection, and per-goal URL deduplication have regression coverage. Release versions are checked across npm, Cargo, lockfiles, and Tauri.

Frontend checks: 8 tests passed; TypeScript/Vite build passed. The compact character was visually inspected in the browser via the fallback browser connection. Browser rendering does not verify native transparency, dragging, focus behavior, or monitor boundaries. Real provider recommendation quality and the installed end-to-end workflow require user verification.

Rust checks: 25 passed, with the opt-in credential-store integration test skipped. Rust formatting passed. Optimized Windows build and NSIS packaging succeeded at version 0.2.0.

Manual release check: install 0.2.0; start a goal; uncheck **Show Buddy only with suggestions**; minimize the workspace; drag Buddy across the desktop; confirm pause/DND hide it. Configure both keys and explicitly enable **Proactive suggestions**; verify a resource opens only when clicked, the card expires after 45 seconds, the selected display mode returns, and no duplicate URL is offered for the same goal. Restart to verify preferences persist while tracking starts paused. Exclusive fullscreen and secure desktops are unsupported.

## Nebius response-format fix — 2026-09-26

Requests now specify a strict `response_format` JSON schema for focus decisions and allow 2048 output tokens instead of 500. The parser accepts a single Markdown-fenced JSON response while retaining enum, confidence, and reason validation. Truncated completions, refusals, empty content, and invalid JSON produce separate safe errors without logging or displaying provider content. No automatic format-repair requests or fabricated decisions are used.

Regression tests cover fenced JSON, truncation (including syntactically valid but incomplete completions), refusal, empty/malformed output, and the schema/token limit in the actual HTTP request. Live verification with the user's provider account remains outstanding; the original failed response was not retained, so its exact cause is unconfirmed.

Reference: [Nebius structured output documentation](https://docs.tokenfactory.nebius.com/ai-models-inference/json).

## Provider Settings update — 2026-09-26

- Frontend: 6 tests passed; TypeScript and Vite production build passed.
- Rust: 18 standard tests passed; the opt-in Windows Credential Manager round-trip test also passed outside the sandbox. It created, replaced, read, and removed an isolated dummy credential, without touching provider credentials. The sandbox initially denied the credential write.
- Rust formatting and Prettier checks passed.
- Optimized Windows executable and NSIS installer rebuilt successfully with Settings.
- Live provider authentication and the interactive installed Settings flow still require manual verification.
- Manual check: install the updated package, open Settings, save each provider key, close and reopen the app, run an explicit search/focus check, replace a key, and remove it. Confirm AI remains off until consent is enabled, errors do not echo keys, and environment fallbacks are understood.

## Initial MVP

Verified locally on Windows on 2026-09-25.

| Check                                                    | Result                                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| TypeScript compilation and Vite production build         | Passed                                                                               |
| Frontend tests                                           | 4 passed                                                                             |
| Rust tests with mocked HTTP servers                      | 16 passed                                                                            |
| Rust formatting and Prettier checks                      | Passed                                                                               |
| PowerShell helper syntax                                 | Passed                                                                               |
| npm dependency audit after installing final dependencies | 0 vulnerabilities reported                                                           |
| Optimized Windows executable build                       | Passed                                                                               |
| NSIS x64 installer packaging                             | Passed                                                                               |
| Release startup smoke                                    | Process remained alive for seven seconds, then was stopped; tracking and AI were off |
| Browser preview                                          | Rendered correctly, including the narrow layout; desktop-only controls were disabled |

The Rust tests include the simulated activity-to-decision-to-feedback sequence, reopening saved SQLite data, nudge suppression rules, strict model response validation, real HTTP request construction against mock servers, retries, and search result normalization.

Artifacts:

- `src-tauri/target/release/desktop-buddy.exe`
- `src-tauri/target/release/bundle/nsis/Desktop Buddy_0.1.0_x64-setup.exe`

Not yet verified: paid/live Nebius and Tavily requests (no runtime credentials were provided), the native interactive popup workflow, and installing the NSIS package on a clean machine. The startup smoke is not a substitute for the manual end-to-end checklist in [DEMO.md](DEMO.md). The GitHub Actions workflow has been authored but has not been run remotely.
