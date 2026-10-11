# Desktop Buddy 0.24.0

A redesign of goals, steps and the daily summary, shipped for Windows and macOS
from the same shared code.

- Goals and steps use one Notion-style design on Today, Goals and Progress:
  collapsed by default, a completion circle, hover-only action dots, and a
  down/up arrow at the right edge.
- Hold a goal for a moment to reorder it; no separate handle is shown.
- Adding a step is one typing line. An Ideas menu offers AI completions that
  start with the typed letters, plus earlier suggestions, with a loading hint.
- Goals and steps always start with a capital letter.
- Completing a goal completes its steps, finishing every step completes the
  goal, and unticking a step reopens it.
- The day summary is one quiet line, for example "3 steps done · 1 goal
  completed · 40m focused".
- Today has a Quiet mode button with an explanatory tip. The Goals page is a
  searchable Active and Archive log with Import in the top right.
- The mascot no longer shows a green ring around it.

Existing goals that already have every step done are completed the next time
the workspace loads. Step completions are stored as before, so history and
progress remain compatible. No update trust or signing changes.

Windows install/restart and an exact macOS 14.5 machine have not been verified
on this Mac; they are validated by the shared release workflow.
