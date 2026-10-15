# AI research continuation audit: 0.31.1

## Reproduced failure after installing 0.31.0

The installed release correctly recalled the corrected synthetic budget,
audience, product and presentation duration in English. A subsequent explicit
request for official Tauri documentation returned the internal receipt
"Read retained messages from this conversation" instead of an answer and
sources. Passing the earlier conversation/action fixtures had not covered this
real research path.

Chat planning still used the primary background model. The dialogue also
treated the first history read as the request's permanent research permission
classification. Failed response verification could fall back to a read receipt,
which described an internal operation without answering the question.

## Correction

- The configured response model now plans explicit chat turns as well as
  writing, reviewing and authorizing their actions. By default this is Kimi K3.
  Nemotron remains the primary background model. Explicit model overrides are
  preserved. More chat calls can therefore incur the response model's price.
- A separate structured check authorizes each general web query against the
  actual latest request and relevant conversation. It receives no workspace or
  Personal Memory packet. History reads cannot grant search permission, but
  they no longer prevent an independently authorized research continuation.
- The existing web-research switch is checked before search. A denied,
  malformed or timed-out authorization fails closed. State/privacy are checked
  again before the external request.
- Unverified read receipts cannot masquerade as final answers. Verified state
  mutations and pending-confirmation receipts retain their existing fallback.

## Automated verification

Local regression passed: 456 Rust tests, 160 frontend tests, 15 release/signing
tests, TypeScript/frontend production build and Rust formatting. Two existing
opt-in Rust tests remain ignored. New regression cases cover query consent,
malformed authorization, excluded workspace/memory data, disabled research
after a history read and preservation of real mutation/confirmation receipts.

Real-provider checks use synthetic data and the signed candidate:

```sh
desktop-buddy --check-conversation-reliability --check-agent-actions --check-web-research
```

The added research check starts with an unrelated synthetic discussion, requests
official Tauri documentation, requires a returned `v2.tauri.app` source and an
explanation containing `minimumSystemVersion`, and checks that goals and memory
are unchanged. Six persisted-conversation cases and nine action checks run in
the same process. Actual run results are recorded in the release PR validation;
the command's `all_passed` includes the optional research check.

## Limits

Model interpretation and source relevance remain probabilistic. Finite tests
do not establish universal correctness or ChatGPT parity. Search permission
review does not replace the user's privacy controls. Repeated macOS Keychain
prompts across separately built candidates remain unresolved. Internal app
signing is not Apple Developer ID signing or notarization. No database
migrations, updater trust changes or credential-storage changes are included.
