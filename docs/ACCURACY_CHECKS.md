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
Production sends app and the first 160 window-title characters. `domain` and
`visible_text` remain in the requested fixture schema but are not silently added
to the prompt.

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
sharing checks and backend state-transition ownership are unchanged.

The first unfinished step is the fixture target. Because the requested case
schema has no prior micro-action field, feasibility/anchor/commitment/execution
also use that first step as their candidate micro-action, estimated at 60 seconds.
Use an appropriately small first step for these cases; the duration is fixture
setup, not a measured result.

Two LLM judges use exactly `http::DEFAULT_RESPONSE_MODEL`, independent of response
model overrides. JSON context order is reply first versus rubric first, with the
same five criteria. Each true item contributes one point; inconsistent or
out-of-range scores are rejected. Differences greater than one flag human review.
Missing judgements are unscored and flagged. Overall mean averages only cases
with two valid scores; scored/error counts and both judgements remain available.
LLM scores are fallible assessments, not independent ground truth.
