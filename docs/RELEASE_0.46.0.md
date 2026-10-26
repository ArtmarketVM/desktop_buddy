# Desktop Buddy 0.46.0

## Voice and chat

- Dictate with an on-device Whisper model on Windows and macOS. First use downloads approximately 548 MB of verified model weights; microphone audio stays on your computer.
- Pause naturally while speaking and press Stop when finished. Dictation produces an editable draft and never sends automatically.
- Optionally enable **Correct dictated text before editing** in Settings → AI. Nebius then receives the transcript and permitted relevant goal titles to correct likely misheard words before the draft appears. This option is off by default; audio remains local, and **Use original** restores the raw transcript.
- Saved goal vocabulary and contextual interpretation help with similar-sounding goal names and add/rename requests while preserving negation, quoted wording and genuine past reports. Names and unclear wording can still need review.
- Desktop chat starts fresh when reopened after ten minutes without a message. Earlier conversations remain available in Chats.
- Chat actions on mascot cards open short editable topic drafts instead of copying the full reminder.

## Progress, settings and planning

- Progress uses violet shades ranked by time spent, with darker shades for goals with more time. Each chart segment opens its goal, and stacks share a baseline.
- Period and date controls sit together at the left. Goal details use compact step indicators.
- Vision model settings use the same compact service-row design and show the resolved model, with a readable layout in narrow windows.
- **Skip today** dismisses planning reminders for the rest of the local day, including after restart. **Not now** retains its 30-minute reminder. Other mascot messages and tracking continue.
- Removed redundant review/journal panels from Today and Progress.

## Platforms and privacy

Windows x64 and Apple Silicon macOS 14.5 or later use the same release. Existing update channels, signing identities and signature verification are preserved. The local speech model is downloaded separately; installers include the required third-party notices. See the updated privacy policy for voice and optional text-correction details.

Automated and synthesized-speech checks do not establish recognition accuracy for every microphone, accent or proper name. Optional real-model tests remain separate from the offline unit suite.
