# Demo and manual verification

Use [the judge guide](JUDGES_START_HERE.md) to install a ready-made release and [the current demo runbook](HACKATHON_DEMO_RUNBOOK.md) for the full sequence. Neither source compilation nor entering personal API keys is required for judges.

## Three different kinds of evidence

| Check | What it establishes | What it does not establish |
| --- | --- | --- |
| Unit/acceptance tests with mock responses | State, schema, privacy, cancellation and receipt behavior on fixtures | Real model quality, microphone input or a visible desktop interaction |
| Real-provider backend rehearsal (`--check-hero`) | Actual Nebius/Tavily operations on isolated synthetic data | Physical microphone input, real screen collection, displayed cards or a full process restart |
| Installed manual demo on each platform | The observed native user sequence on that build and system | General accuracy for every application, language or goal |

`DEMO_MODE=true` simulates activity. `AI_MOCK=true` independently substitutes provider responses. Leave both false for a native live demo. A real provider called with simulated activity is still not proof of real foreground capture.

## Preparation and live sequence

1. Use the same reviewed release on Apple Silicon macOS 14.5+ and Windows x64. Keep **Built-in AI** selected, or deliberately select **Use my API keys** for a personal account.
2. Use fictional goals, messages and visible result receipts. Enable only the observation options intended for the test; grant system permissions yourself and check quiet/meeting/fullscreen suppression.
3. Prepare the local Whisper model through the microphone control before recording the demonstration. First use downloads verified weights. Test the actual microphone; an existing text transcript is not a speech test.
4. Create a goal and steps, make it the focus, Park it, switch tasks and Resume. Verify saved context.
5. Show a matching request/outcome in a real foreground window. Check the observed interface-text/image capability in **Settings → About → Diagnostics → Personal AI Engine**. New tasks require acceptance; completion requires verified evidence and the applicable confirmation/automatic-completion permission.
6. Authorize a research request and inspect actual Tavily-backed sources, then inspect Progress and the work journal.
7. Quit and reopen the process. Check saved goals, history/context and Undo. Saved consent/settings persist; do not expect restart to reset tracking or AI to off.

Record failures and evidence scope honestly. Model silence can be a valid decision; no collection, a failed request and presentation suppression are separate conditions.

## Developer diagnostics and release checks

The available `--check-*` flags are documented in [the demo runbook](HACKATHON_DEMO_RUNBOOK.md), [accuracy checks](ACCURACY_CHECKS.md) and [local voice](LOCAL_VOICE.md). They use synthetic data but live modes can incur provider charges. Keep keys and private reports outside Git. CLI diagnostics accept `BUDDY_AI_CONNECTION_MODE=personal` or `built_in`; environment keys alone do not select the connection.

Run required checks once for the affected source and follow [the coordinated release process](RELEASE_PROCESS.md). Do not build/publish an unsigned one-platform installer as a complete release smoke test. Preserve both platform gates, updater trust and the macOS internal signing identity.
