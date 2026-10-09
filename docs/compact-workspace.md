# Compact workspace

The 0.21.0 workspace keeps Today focused on goals and steps. Buddy opens a compact text input or a voice recording bar at the bottom right. The Chats page provides the full conversation view and local history. The sidebar can be collapsed; its state is saved on this device. Do not disturb is an icon on Today, with additional controls in Settings. The app version and local profile information are in Settings.

Accepted steps use checkboxes and a contextual edit/delete menu. Automatically generated suggestions appear below them, with Add, Add all and Ignore. Ignored suggestions stay dismissed on this device. Adding suggestions preserves the existing plan and its revision checks. AI title improvements and research continue through the existing background analysis service; no manual Improve / Research panel is shown.

Desktop Buddy uses a native draggable window instead of a chat card constrained inside another window. The compact window remembers its desktop anchor and restores it within an available monitor's work area, including displays with negative coordinates. If that display is disconnected, the primary monitor is used. Esc or Close returns to the launcher. Existing proactive intervention cards remain available.

Chats are stored in SQLite. Existing chat messages are migrated into one conversation. New conversations have independent histories, retain the newest 100 messages each, and get their title from the first message. Changing or deleting a conversation invalidates a pending AI response. Deleting a conversation affects only its messages; local history retention also removes conversation titles.

Voice records up to 60 seconds. Mute disables the microphone track and excludes muted audio. Stop transcribes locally and puts the transcript in the text input for review before sending. Closing or switching modes releases the microphone. This is a recording/transcription flow; live audio replies are not implemented. Local transcription currently requires installed Windows speech recognition languages. The shared voice UI is available across platforms, but the existing macOS transcription adapter still reports that local recognition is unavailable. macOS native integration and physical multi-monitor/DPI testing require a separate verification pass on those systems.

The P1 semantic duplicate detector, conversational goal-edit proposals, and a macOS speech adapter remain follow-up work. The compact UI preserves the existing rule that chat advice does not silently mutate goals.
