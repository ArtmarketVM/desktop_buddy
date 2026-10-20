# Desktop Buddy 0.38.0

- Recognize concrete work outside the goal list from the existing opted-in, redacted screen context on Windows and macOS.
- Show a persistent Work noticed card in Today with observed active time, an editable title, Add to completed, Not now and Dismiss.
- Add the work as a completed Today goal only after confirmation. Move existing time atomically rather than counting it under two goals; include it in Today and My progress. Support activity with no selected goal.
- Reuse the protected Accessibility cache, existing consent/quiet-hour safeguards, actual interval boundaries and history retention/deletion. Never estimate duration from the model or infer work during app downtime.
- Include the preceding local 0.37.1–0.37.3 changes.

Local Apple Silicon builds use the existing internal signing identity. A joint Windows/macOS GitHub release has not been published for this version.
