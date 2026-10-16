# Desktop Buddy 0.32.1

- AI service indicators use a saturated green for successful connection/access checks and a clear red for unavailable, unconfigured or offline states, with separate light and dark theme colors. The badge diameter increases from 5px to 8px. Unchecked, expired, checking and simulated states retain their neutral meaning; green does not imply that generation, billing or Tavily search has been tested. Details remain available on hover or focus.
- The sidebar control is more compact: a 32px button with a 20 x 18px icon. Its position and keyboard shortcut are unchanged on both systems.

Shared visual patch for Windows x64 and Apple Silicon macOS 14.5+. No Rust behavior, data migrations, provider requests, stored preferences, signing identities, credential helper or trusted updater keys change. Both native signed builds and release checks gate publication.
