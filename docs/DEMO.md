# Demo and manual verification

## Offline rehearsal

```powershell
./scripts/dev.ps1 -Demo -MockAI
```

1. Enter `Finish the hackathon presentation` and start focus.
2. Enable AI check-ins. The UI must clearly say that activity and decisions are simulated.
3. The sequence advances every 15 seconds: PowerPoint (10 minutes), Nebius Docs (5 minutes), YouTube (7 minutes).
4. After YouTube appears, click Check my focus or wait for the automatic check. Expect a drifting decision and a separate Buddy popup.
5. Click This is related. Verify that the popup closes and feedback is stored in SQLite.
6. Enable Do not disturb. No additional popup should appear.
7. Pause tracking. Activity must stop changing.
8. Restart. The saved goal and activity should remain, but tracking and AI should be off.

## Real provider demonstration

1. Set valid Nebius and Tavily credentials in the local `.env` file. Confirm the model ID in your Nebius account.
2. Set `DEMO_MODE=true` and `AI_MOCK=false`, or run `./scripts/dev.ps1 -Demo` in a fresh terminal without an `AI_MOCK=true` override.
3. Start a presentation goal. Enable AI check-ins after reading the disclosure.
4. Wait for the simulated YouTube segment and click Check my focus. The response must come from Nebius; a classification is not guaranteed because it is model-generated.
5. Confirm a high-confidence drifting/intervene response opens Buddy. Dismiss it or mark it related.
6. Enter a relevant search query and click Search. Confirm real Tavily titles, links, and snippets appear.
7. Restart and confirm the goal, activity, and decision remain.
8. Stop the application and remove runtime credentials from the terminal if no longer needed.

## Live Windows collection

1. Set `DEMO_MODE=false`, `AI_MOCK=false` and start the app.
2. Set a goal, switch between an editor, PowerPoint, and a browser, and check timeline segments.
3. Keep one foreground window active for at least 10 seconds. Its duration should increase without duplicate segment rows.
4. Leave the machine idle for over 60 seconds. Idle time should appear and active duration should reset.
5. Pause tracking, switch apps, and resume. Paused time must not be counted.
6. Enable AI only if you are comfortable sending the displayed titles to Nebius.
7. Confirm that missing/invalid credentials show a readable error while local tracking continues.
8. Confirm that neither focus checks nor web searches expose credentials in the UI.

## Release smoke test

Build with `npm run tauri -- build -- --locked`, install the generated NSIS executable, and launch with runtime environment variables. Verify goal creation, tracking, DND, popup feedback, real search, and persistence. Never put provider credentials into GitHub build secrets or compile-time frontend variables.
