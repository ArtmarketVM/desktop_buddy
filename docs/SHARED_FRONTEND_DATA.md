# Shared frontend data flow

Developer 2 base: `11760017314095d75374449690c2a1c42c5af08a` (`origin/main`, version 0.39.0). Branch: `codex/shared-state`, isolated worktree. Existing checkouts and their changes are untouched.

## Verified starting map

- Dashboard: App in both main and buddy windows reads `get_dashboard` every 3 seconds; settings, sidebar, Today and mascot consume it. Most settings/goal/focus/tracking/companion commands change it. Appearance has its own event; other mutations mostly have no invalidation event.
- Workspace: Experience reads `get_core_snapshot(anchor, period)` plus `get_core_drafts` every 5 seconds, again after every mutation, on page/revision changes and on goal-analysis/completion/draft events. Progress keys use the selected anchor and day/week/month/year; Today uses null/week.
- Chat: Conversation reads current-conversation history and AI preferences every 5 seconds, on busy transitions and chat events. Chats independently reads conversation summaries on that same event and after mutations. CoachingPanel separately inspects a session keyed by conversation id. The history endpoint reads the globally selected conversation; selection must invalidate every cached history before new data is displayed.
- Activity: Timeline reads the latest 500 activity segments every 15 seconds and filters by local day. WindowActivity reads explicit UTC date bounds plus optional goal id every 10 seconds. Core progress and goal rows also consume recorded time.
- Service status: sidebar and AI Settings independently read the same local status every 30 seconds and on focus. Actual provider checks remain explicit/startup calls, not cache reads. Engine diagnostics reads every 5 seconds only while expanded/live.
- Work noticed reads the current offer every 5 seconds and on its dedicated event; its mutation creates completed work and transfers intervals.
- Nine backend event names exist at the base: the six `buddy://` events in the task notes, the generic `buddy://event` stream, plus `goal_match_suggestion` and `unplanned_work_suggestion`. Per-window stores cannot depend on local invalidation to refresh the other webview.
- Clock/display timers: Avatar animation; TrackingStatus clock; MessageMeta relative timestamps. Permission checks (2 seconds) and updater checks (4 hours) are intentionally separate. None should be removed to reduce request counts.

## Ownership and coordination

No dependencies, manifests, lockfiles, CI, CSS, class names or selectors are changed. Developer 1/3 were not identifiable in available chats. The user explicitly deferred the privacy URL; `PRIVACY_POLICY_URL` stays unchanged. Rebase after Developer 1's CSS lands and run Developer 3's visual checks when available; no visual harness was supplied at this base.

## Implementation and validation

Initial validated application source: `11c3d718335a4b05db5c984fdff5bdf67f1e5abc`, after local milestone `c5507e7`. The subsequent merge-review fix and its validation are recorded below.

- `npm ci` succeeded using Node 24.14.1, without changing dependencies or lockfiles.
- Targeted Vitest runs covered the cache, event bridge, IPC adapter, parameter changes, preference sharing, existing provider controls, chat/coaching/voice regressions and preview controls. New tests cover stale successes/failures, in-flight deduplication, initial failure/recovery, reset events, Strict Mode, late subscription cleanup and missed-event recovery.
- `npm test`: **261 passed**, 51 files, 7.46 seconds.
- `npm run build`: version validation, TypeScript and Vite passed; Vite build 1.50 seconds. This builds frontend assets, not an installer.
- `cargo fmt --manifest-path src-tauri/Cargo.toml` passed.
- Locked Rust suite: **610 passed, 2 existing ignored**, 94.27 seconds of test execution. New Rust tests exercise both-window broadcast payloads, sample-clock filtering, event coalescing and conversation-scoped history after selection/deletion.
- `git diff --check` passed. No CSS, dependency manifests, lockfiles, CI, signing files or credentials implementation changed.

Rust used the repository-local toolchain and existing ignored target cache. The command was:

```sh
export CARGO_HOME="$PWD/.tools/cargo"
export RUSTUP_HOME="$PWD/.tools/rustup"
export CARGO_TARGET_DIR=/Users/ekaterina/Documents/meta/desktop_buddy/src-tauri/target
export CARGO_BUILD_JOBS=1
export PATH="$PWD/.tools/cargo/bin:/Users/ekaterina/.nvm/versions/node/v24.14.1/bin:$PATH"
cargo --config 'profile.dev.package.desktop-buddy.debug=0' --config 'profile.dev.package.desktop-buddy.codegen-units=4' --config 'profile.test.package.desktop-buddy.debug=0' --config 'profile.test.package.desktop-buddy.codegen-units=4' test --locked --manifest-path src-tauri/Cargo.toml -- --test-threads=2
```

The local build overrides only constrain compiler memory use; no repository configuration changed. Logs are in `/tmp/sumi-shared-{frontend-full,build-full,rust-full}.log`.

## Shared ownership and invalidation

`src/data/queryClient.ts` owns per-key snapshots, one in-flight request per key, generation checks, initial/retry loading state, last-successful data, safe errors and a single fallback scheduler per webview. `useQuery` subscribes through React's external-store API. Inactive queries do not poll. Unsubscribed consumers cannot receive late results; delayed listener registration is disposed safely. Strict Mode's unsubscribe/resubscribe cycle retains one bridge and one request.

`src/data/resources.ts` declares queries; dashboard ownership is declared once in App and passed down. Cache keys include anchor/period, explicit UTC window bounds and optional goal id, activity-segment goal id, and coaching/history conversation id. The backend history command accepts an optional conversation id so switching the selected conversation cannot change the scope of a pending read. Timeline's day filter is local because its endpoint returns the same latest 500 rows for every day.

`src/data/ipc.ts` preserves the real Tauri command payloads and errors. It invalidates resource families after mutations, including partial failures; components still await refresh after actions. A 20 ms invalidation batch combines related notifications. Invalidating during an in-flight request discards its response and follows with a fresh read; older successes and failures cannot overwrite a local authoritative update.

`src/data/client.ts` installs one event bridge and focus/visibility/online recovery per observed webview. Initial loading is followed by invalidation once listener registration finishes, closing the read/subscription gap. Missed or failed events recover through focus and bounded fallback reads. The steady `buddy://event` activity packet is deliberately filtered: it fires every backend tick. Foreground transitions refresh dashboard state; recorded-time changes use the coalesced event instead.

| Change | Invalidated resources / coverage |
| --- | --- |
| Core goal, Today, ordering, timer and completion mutations | New immediate `buddy://data-changed`: dashboard, workspace, activity, coaching; every anchor/period is invalidated |
| Core preferences | New workspace invalidation |
| Provider key / AI preference changes | New dashboard, services, preferences and relevant workspace/notice invalidations; provider probes emit service/engine changes on completion |
| Buddy, focus, theme, profile, tracking and companion state | Common backend sync fingerprints semantic dashboard state and broadcasts changes to both windows; pure sample timestamps are excluded |
| Collected intervals, window journals, background database writes | Database-change observation coalesces workspace/activity/notice/engine invalidation at 15 seconds; explicit mutations bypass the gate |
| Chat mutations and coaching updates | Existing chat event refreshes history, summaries, coaching and affected goal/dashboard state; selection clears current-conversation history; delete/clear discard cached chat data |
| Goal analysis/completion, captured drafts, unlisted-work offer | Existing dedicated events target workspace/dashboard/activity, drafts or noticed work |
| Profile reset / clear history | New reset broadcast discards all cached personal data and local frontend error details before refetching |

The backend's new event contains only resource names and a reset flag. It broadcasts from the app, rather than targeting one window. No event contains credentials, screen excerpts or chat messages. Existing event names and consumers remain compatible.


## Polling that remains

Fallback reads share one scheduler; identical resources across consumers share the same request and interval. Hidden documents skip automatic reads and refetch on return. Settings resources and the live diagnostic monitor stop observing when their containing page is inactive.

| Resource | Visible fallback | Reason |
| --- | --- | --- |
| Dashboard | 15 seconds per window | Runtime/status changes and recovery if event delivery fails; within the existing 20-second tracking freshness gate |
| Core snapshot per anchor/period | 15 seconds | Running-time totals, day rollover and legacy mutation coverage |
| Drafts, AI/tracking preferences | 30 seconds | Event recovery and remaining legacy settings writers |
| Conversation summaries, history per conversation, coaching per conversation | 30 seconds | Event recovery and background/other-window updates |
| Activity segments and window-history bounds/goal | 15 seconds | Accumulating measured intervals; shared across identical filters |
| Local service status | 30 seconds | Expiring receipts and event recovery; reads do not run provider health checks |
| Engine diagnostics | 5 seconds, only open/live/active | Diagnostic counters change without dedicated events; no inference probe is started by this read |
| Work noticed | Existing 5 seconds | Runtime-only offer expiry, revocation and changing measured duration are not all emitted as events |

Five component `setInterval` owners remain unchanged: Avatar animation, TrackingStatus clock, MessageMeta relative timestamps, native Mac permission checks and the four-hour updater check. Pointer-follow and UI debounce/undo timers are also preserved. There is no component-owned interval left for the migrated data reads.

Ordinary user-facing refresh/action failures use shared fixed messages. Detailed errors are retained in memory (latest 20, up to 4,000 characters each) and available behind the existing Diagnostics panel's new collapsed Frontend data diagnostics section. IPC arguments are never recorded; token/password/API-key patterns are redacted. No diagnostics are sent to a provider. Safe local input/permission guidance and explicit known-choice messages remain specific.

No production HTTP request, provider credential storage, matching threshold, coaching state machine, DEMO_MODE or AI_MOCK semantics were changed. The store never infers provider health or substitutes simulated data. Browser preview keeps its local interactive state without observing desktop queries.


## Remaining integration limits

Validation ran on Apple Silicon macOS. Broadcast delivery is tested with Tauri's mock runtime and two windows; actual installed-app cross-window behavior and native Windows builds were not exercised. No installer, installation, release, remote branch, PR or merge was created for this task. No real-provider paid accuracy/probe run was needed for these local read/invalidation changes.

A final fetch still found `origin/main` at `1176001`. Developer 1's CSS changes have not landed there, and Developer 3's visual harness/commands were not available at this base. Rebase onto main after those land, then run the supplied visual checks before merging. Existing UI structure, selectors and CSS were preserved; the only added diagnostic markup is the collapsed frontend-error detail inside Diagnostics. The privacy URL remains unchanged at the user's explicit request.


## Independent merge review

The owner subsequently authorized pushing this part independently and requested a merge. PR: https://github.com/ArtmarketVM/desktop_buddy/pull/36. Main remains at the agreed base; CSS and quality infrastructure are kept separate.

Review found that a successful Settings save could clear the dirty guard before the shared preference/tracking snapshots caught up, briefly restoring cached values in the form. Commit `cdda0c00e3e3980ae601af0e9872e92bf57baedb` awaits those canonical reads before confirming the save. The added regression first failed on the previous source, then passed with the fix. No CSS or dependency changes were needed.

Validation for `cdda0c0`:

- Targeted `vitest run src/core/Settings.color.test.tsx src/core/Settings.providers.test.tsx src/data`: 26 passed across seven files.
- `npm test`: 262 passed across 51 files, 6.19 seconds.
- `npm run build`: passed; Vite 1.32 seconds.
- Rust source, dependencies and configuration are unchanged from the successful 610-test run above; that result remains valid. Native Windows/macOS PR CI must pass at the final head before merging.
- `git diff --check`: passed. Logs: `/tmp/sumi-shared-merge-{targeted,frontend,build}.log`.

Developer 3's `codex/quality-gates` branch is now visible. Its approved visual baselines are still pending and it is not on main. Its scripts, dependency additions, privacy-site changes and CI changes are outside this independent application-logic PR. The user-deferred privacy URL remains unchanged. This merge does not publish an application release.
