# sumi 0.36.3 — interactive AI latency

The installed 0.36.2 journal recorded a chat planning timeout after 60 seconds.
Its error mapper incorrectly presented this as an unreliable answer and asked
the user to make the request more specific. Later retry and confirmation calls
succeeded with the same saved key.

Kimi K3 requests previously omitted `reasoning_effort`. The model's documented
default is maximum effort, so the app now supplies the supported `low` value
unless a caller explicitly supplies another effort. It retains the same model,
output budget, bounded requests and action-validation/confirmation rules.
This reduces avoidable reasoning work; it cannot eliminate provider outages.

Sources: [Kimi K3 model usage](https://github.com/MoonshotAI/Kimi-K3#6-model-usage)
and [Nebius Kimi K3 request profile](https://github.com/nebius/nebius-physical-ai/blob/main/docs/workbench/token-factory.md).

Timeout and provider availability errors now have specific messages. Goal and
chat edits no longer discard a verified authentication check, while consent and
credential changes still invalidate it.

`desktop-buddy --check-mixed-actions` runs the full dialogue and confirmation
pipeline against synthetic goals in an in-memory database. It checks two new
goals, the exact completed/unfinished steps, a saved checkpoint and preserved
focus. It includes duplicate unanswered requests, and fails on partial changes.
It never opens the user's database or prints prompts or credentials.

Local Apple Silicon validation passed: 553 backend tests, zero failures, two
existing opt-in native tests ignored; production frontend and signed native app
builds; Rust formatting and whitespace checks. The nine live action checks all
passed with the new effort setting. The live mixed-request check passed in
14.5 seconds across its request and confirmation turns, verifying saved state
rather than trusting the model's message. These finite checks do not establish
universal availability or correctness.

The signed local 0.36.3 app was installed and reopened. Both providers connected
using the existing saved keys. The previous app and a consistent database backup
were retained locally. No GitHub release was published.

Windows x64 installer validation remains required before publishing the
coordinated release. Signing identities, credential storage and updater trust
are unchanged.
