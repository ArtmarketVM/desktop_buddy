# Personal AI demo rehearsal

Use this runbook to distinguish verified backend behavior from a successful live desktop demonstration. Passing mock tests or a headless probe alone does not make the recording ready.

## Preparation

1. Use the current reviewed, signed build on Apple Silicon macOS 14.5+ or Windows x64. Do not use an ad-hoc Mac build: its credential helper cannot read saved provider keys.
2. Use **Built-in AI**, selected by default under **Settings → AI → Services → AI connection**. It routes Nebius and Tavily requests through the deployed gateway; judges do not enter provider keys. **Use my API keys** remains an optional alternative for your own provider accounts. Never put credentials in this runbook, screenshots, recordings, Git or command arguments. See [Judge installation and testing](JUDGES_START_HERE.md) for the ready-made packages.
3. Use disposable goals named `AI DEMO Hackathon` and `AI DEMO Client`. Keep personal goals and private window text outside the recording. The automated rehearsal creates its own temporary database and deletes only that directory afterward.
4. Check AI sharing, tracking, local microphone/speech permissions, working hours, quiet hours, DND and excluded apps. A silent decision is valid; a missing provider connection is a different condition. Do not disable privacy protections to manufacture a successful test.
5. Keep `AI_MOCK` off. `DEMO_MODE` simulates activity; it does not establish native foreground tracking even when provider calls are real.

## Automated real-provider rehearsal

The new check uses the modern shared `AgentRuntime::handle_dialogue` entry, actual Nebius requests and Tavily search. Provider usage may incur charges. It never opens the user's database. Read stage results, not only the process exit code.

macOS, using the internally signed candidate binary:

```bash
"/absolute/path/sumi.app/Contents/MacOS/sumi" --check-hero
```

Windows, using the current application binary:

```powershell
& 'C:\absolute\path\sumi.exe' --check-hero
```

Without audio, the first stage is explicitly labeled `transcript_fixture`. It exercises the shared post-STT voice action path, not speech recognition or microphone capture.

Test native speech from the application's recording controls, not from a shell-launched speech process. On macOS, speech permission is attributed through the launching application; a shell probe cannot establish native application permission or microphone readiness. Keep audio local. In System Settings -> Keyboard -> Dictation, confirm that Dictation is on and the required language download has completed. An English success does not establish Russian readiness.

Expected backend stages:

| Stage | Required observation |
| --- | --- |
| Voice transcript -> actions | Goal A has exactly two steps and becomes the focus |
| Park A | Persistent checkpoint and next action exist |
| Switch to B | B becomes focused without overwriting A |
| Completion detection | Real model finds the synthetic sent receipt; step is unchanged before confirmation |
| Explicit confirmation | Only the intended client step is completed |
| Resume A | Original checkpoint is recovered, A is focused |
| Background reasoning | Actual structured decision and validation are reported; silence is never relabeled as an offer |
| Research consent | Creating an offer does not create a research job; accepting it does |
| Real research | Tavily returns sources, backend-owned excerpts are selected, synthesis attaches to A |
| Feedback | Accepted research is stored through the normal feedback API |
| Step completion | First A step completes; second remains unfinished |
| Daily summary | Both lanes appear; unfinished work remains separate |
| Database reopen | Context, research and confirmed completion survive; a new real dialogue can retrieve them |

`backend_passed` covers these controlled backend checks. `ready_for_live_recording` remains false because the headless check cannot attest to physical input, native popups or process relaunch. The research offer and confirmation are supplied programmatically as explicit synthetic user decisions; they do not prove those buttons were clicked in the UI. Background help must be demonstrated independently if the real model chooses silence.

## Native desktop acceptance

Complete this checklist on both supported systems. Record build version, date, platform and evidence next to each result. Leave unperformed items unchecked.

- [ ] Start the signed application. Personal AI Engine reports real providers, tracking and the actual active gates.
- [ ] Click the microphone, speak the demo command, stop recording and inspect the transcript. Goal creation enters the same chat pipeline as typing.
- [ ] Check A's exact title, two steps and focus in Today. An assistant message alone is insufficient evidence.
- [ ] Say “Park this; I need to answer a client.” Inspect the saved checkpoint and next action.
- [ ] Create/focus B and work in a visible synthetic test window. Progress attributes the activity to the intended lane.
- [ ] Show an explicit receipt for B's client reply. Completion detection proposes the correct step and leaves it unfinished until the user confirms.
- [ ] Confirm completion using the native intervention. Inspect the saved result.
- [ ] Resume A. Read its checkpoint and next action; B's private context must not appear.
- [ ] While A has a genuine information gap, observe the background journal. Verify that a useful offer is actually displayed. Do not force model silence into success.
- [ ] Accept Search the web. Verify retrieved sources, useful synthesis and attachment to A. Declining must not call Tavily.
- [ ] Complete the researched step. Keep A's draft step unfinished.
- [ ] Ask what was completed today. Check every claimed completion against saved records across both lanes.
- [ ] Quit the process completely, reopen the application and resume A. Verify memory, research and unfinished work persisted.
- [ ] Enable DND and verify interruptions stop. Check an excluded app and Memory OFF separately, then restore the user's chosen settings.

## Recording outline, under three minutes

Use the synthetic workspace and already authorized services. Capture genuine outputs; do not substitute fake responses during editing.

- 0:00-0:20: State the problem and show the real Nebius/NVIDIA configuration.
- 0:20-0:45: Voice creates a goal and steps; show the saved state.
- 0:45-1:10: Park A, switch to B and confirm an evidence-backed completion.
- 1:10-1:35: Resume A and recover its checkpoint.
- 1:35-2:05: Accept a useful research offer; show Tavily sources and saved context.
- 2:05-2:30: Grounded daily summary, full process restart and recovered context.
- 2:30-2:45: Show privacy controls and explain the bounded event-driven agent loop.

A healthy sidebar indicator is not evidence of a successful task. A passing backend rehearsal is not evidence of a complete native demo. Keep both kinds of evidence.
