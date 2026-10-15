# Desktop Buddy 0.31.0

Available for Windows x64 and Apple Silicon Macs running macOS 14.5 or later.

- Reopening the desktop companion chat continues the selected conversation.
  Use **New chat** when you want a separate conversation.
- Chat display limits no longer silently delete older messages. Existing
  history retention and explicit deletion controls still apply.
- AI receives a larger, bounded conversation context and can retrieve older
  messages from the same chat when needed. Chats remain isolated.
- Draft editing preserves recent corrections and distinguishes numbered draft
  items from saved goal steps. Goal changes still require backend validation.
- Response instructions and verification now explicitly reject invented product
  features, pilot results, prices and payback claims. Proposed assumptions must
  be identified as proposals.
- Natural answers use plain text, while actions and validation retain strict
  structured JSON. Kimi K3 writes and reviews responses and checks mutation intent;
  Nemotron continues structured planning and background reasoning.
- Park can save known local state after a provider outage, without inventing
  progress. Unsafe AI output and stale state remain rejected.
- Clear destructive requests create a backend confirmation preview rather than
  stopping at an untracked verbal confirmation.
- Natural-response models use lower sampling temperature; Nemotron retains its
  existing deliberate planning configuration.
- Added opt-in real-provider checks for persisted conversation context, older
  history retrieval, corrections, grounded drafts, Memory OFF and Hebrew.

No database migration, updater trust change or credential-storage change is
required. Previously deleted history cannot be recovered. This release does
not claim perfect answers or equivalence to ChatGPT.
