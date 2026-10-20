# Desktop Buddy 0.37.1

## Chat and connection recovery

- Keep the desktop mascot anchored when opening its chat, and allow dragging the chat and mascot together.
- Add provider connection retry controls to the sidebar.
- Remove the ordinary-chat “Help me start” section and use an envelope icon for feedback.
- Bound slow planning and review requests with the existing supported model fallback.
- Include recent conversation history in coaching replies.

## Goal matching and developer checks

- Include browser domain and page title when matching foreground activity to open goals.
- Share a redacted excerpt of at most 400 characters only when screen task detection is enabled; reuse the completion detector’s cached sample.
- Add five fixed matching examples, including two examples that leave activity unassigned.
- Add real-provider and offline accuracy checks for goal matching and coaching voice.

## Local validation build

This version is prepared locally for Apple Silicon Macs running macOS 14.5 or later. Windows installers and a GitHub release have not been published for this version. Existing signing identities, trusted update channels and runtime-only credentials are preserved.
