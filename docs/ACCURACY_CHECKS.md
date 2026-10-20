# Live accuracy checks

These opt-in CLI checks send fixture data to the configured Nebius endpoint.
They never open the installed database or change credentials. Keys use existing
runtime configuration; never put keys in fixture files or reports. Live calls
can incur provider charges.

```sh
cargo run --locked --manifest-path src-tauri/Cargo.toml -- --check-goal-matching
cargo run --locked --manifest-path src-tauri/Cargo.toml -- --check-coaching-voice
```

For offline parsing/report smoke checks:

```sh
AI_MOCK=true cargo run --locked --manifest-path src-tauri/Cargo.toml -- --check-goal-matching
AI_MOCK=true cargo run --locked --manifest-path src-tauri/Cargo.toml -- --check-coaching-voice
```

In PowerShell, set `$env:AI_MOCK = 'true'` first. Remove it before live evaluation.
Mock mode uses fixed canned outputs, without reading provider credentials or
calling providers. Mock scores are not model-accuracy evidence.

Fixtures are read at runtime from `src-tauri/test-data/`, independent of the
working directory. Replace the 10 matching and 5 coaching placeholders with
labelled data; changing the JSON does not require rebuilding. IDs must be unique
and nonempty. History roles are user/assistant. Do not commit personal real cases.

Reports use new timestamped filenames in `src-tauri/test-data/results/`, ignored
by Git. Replies and reasons can repeat supplied text; reports omit credentials
and full request payloads. Unix files are owner-only. Exit 0 means the run
completed, not that a quality threshold passed. Per-case provider, parsing and
judge errors remain in JSON and cause exit 1.

## Goal matching

The live path reuses production `request_at`, its prompt, model and validation.
This measures the cloud request, not the local focus/rule/cache/debounce cascade.
Production sends app, window title (first 160 characters), available browser domain
and page title (first 160 characters), and up to 400 redacted visible-text characters
under the existing `screen_task_detection` opt-in. Absent fields are null.
The CLI uses supplied fixture text as a synthetic opted-in sample through the same
redaction and request builder; it never samples the actual desktop. Fixtures may
optionally supply `page_title`; for browser fixtures it otherwise uses the supplied
window title. `visible_text` may be null. Live sampling/cache/consent behavior is
covered separately by isolated Rust regressions. This comparison still needs the
hand-labelled real corpus before it can establish real-world accuracy.

Accuracy uses all cases; request failures count as incorrect. False-positive
rate is assigned predictions / expected-null cases among valid responses.
False-negative rate is null predictions / expected-goal cases among valid
responses. A wrong nonnull ID reduces accuracy but is not a null false negative.
Errors and denominators are reported separately. An empty denominator is JSON
`null` / table `N/A`. Mock predictions are always null, independent of labels.

## Coaching voice/style

The live generator calls production `coaching::chat::response()` using an
in-memory coaching session. This evaluates transcript response style, not
microphone/STT accuracy. Production responses now include recent history from
the dedicated coaching chat: at most 12 earlier messages and 6,000 serialized
bytes, excluding the latest message supplied separately. Existing prompt text,
sharing checks and backend state-transition ownership are unchanged. The response
now uses the verbatim voice guide and eight examples, followed by the original
rules and a 25–60 word target. Default coaching interpretation and response calls
use a bounded Kimi attempt followed, on timeout/network/5xx failure, by one fast
Nemotron attempt with identical messages and schema. Consent and session freshness
are checked before each disclosure. Explicit model overrides remain authoritative.

The first unfinished step is the fixture target. Because the requested case
schema has no prior micro-action field, feasibility/anchor/commitment/execution
also use that first step as their candidate micro-action, estimated at 60 seconds.
Use an appropriately small first step for these cases; the duration is fixture
setup, not a measured result.

Two LLM judgements use the fixed `http::DEFAULT_PRIMARY_MODEL` (Nemotron),
independent of response-model overrides and without judge-model fallback. This
replaces the previous Kimi judge after repeated live timeouts; scores from the
two judge models are separate baselines. Each judge call is a single request
with a 60-second deadline and a bounded reasoning/output budget; timed-out generations are
not restarted. JSON context order is reply first versus rubric first, with the
same five criteria. Each true item contributes one point; inconsistent or
out-of-range scores are rejected. Differences greater than one flag human review.
Missing judgements are unscored and flagged. Overall mean averages only cases
with two valid scores; scored/error counts and both judgements remain available.
LLM scores are fallible assessments, not independent ground truth.


For a focused diagnostic, append `--case placeholder-01` to the coaching voice
command. Omitting the option still evaluates the complete corpus. CLI progress
identifies reply generation and each judge stage without printing credentials,
request bodies or hidden reasoning. Reports distinguish the configured generation
model, its possible production fallback and the fixed judge model. Generation
and judging can both use Nemotron; these scores are a rubric diagnostic, not an
independent human assessment.
