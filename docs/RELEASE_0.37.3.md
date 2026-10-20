# Desktop Buddy 0.37.3

## Coaching replies and connection recovery

- Add the supplied calm-colleague voice guide and eight verbatim examples to coaching replies, preserving every existing rule, schema cap and response validator.
- Apply the guide to micro-action proposals and use the language of the goal for their titles.
- Bound default coaching interpretation/reply generation to one Kimi attempt and one fast Nemotron attempt on timeout, network failure or server unavailability. Preserve the exact messages, schema and backend state-transition ownership.
- Recheck existing sharing, session and target guards before fallback disclosure. Do not fail over rejected keys, billing/quota errors, invalid output or explicit model overrides.
- Use a fixed Nemotron judge for voice/style checks after repeated Kimi timeouts, with reasoning enabled, two orderings, the unchanged rubric, strict parsing and score consistency validation. This is a new judge baseline, not a directly comparable improvement over the previous Kimi score.
- Add per-stage CLI progress and optional single-case diagnosis.

Includes the preceding local 0.37.1/0.37.2 improvements. Prepared for local Apple Silicon macOS 14.5+ validation with the existing internal signing identity. Windows installation and a joint GitHub release have not been published for this version.
