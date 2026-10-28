# Desktop Buddy 0.48.1

## Notice short work results sooner

- Refresh permitted active-window screenshots and goal-aware AI observation with a minimum interval of 20 seconds. Previously screenshot attempts were spaced by two minutes and observation checks by one minute.
- Refresh the shared interface-text cache after 20 seconds so matching and completion checks can use newer text from the same window.
- Existing screenshot, tracking, AI-sharing and automatic-completion choices are preserved. Screenshots still require the feature to be enabled and the applicable system access.
- The shared limit remains 120 background observation requests per rolling hour, with capacity reserved for independent result verification. Busy workers, provider latency, unchanged evidence, privacy gates and that budget can delay or skip a check; 20 seconds is not a guaranteed notification time.
- Goal completion still requires sufficient evidence, with independent verification for automatic completion and Undo. More frequent sampling does not guarantee recognition of every generated image or download.

## Platforms

- Windows x64 and Apple Silicon macOS 14.5 or later, using the existing updater trust and reviewed Mac signing identity.
- Corrected observation documentation to distinguish first-launch defaults in 0.48.0 from preserved choices in existing profiles.
