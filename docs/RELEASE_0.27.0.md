# Desktop Buddy 0.27.0

Personal AI workflows for Windows and macOS, built on the existing goals, chat, tracking and local speech interfaces.

- **Reliable chat actions:** structured skills create, rename, inspect, complete, reopen and organize goals and steps using real backend IDs. Conversation references support follow-up instructions. Ambiguous or stale targets require clarification. Destructive operations retain confirmation or reliable goal undo.
- **Personal memory:** persistent local facts, preferences, meaningful events and independent goal checkpoints. Settings let you inspect, edit, pin, forget and clear memory, with separate switches for work context, preferences, feedback and conversation context.
- **Park and Resume:** save where a goal stopped, its next action and waiting dependency, then return to it after switching projects, restarting or changing days. Resuming does not start a timer or claim completion.
- **Event-driven assistance:** meaningful events drive scoped reasoning with debounce, cooldown, privacy/DND gates and cancellation. Stable collector ticks do not trigger a model request each time. Staying silent is a valid decision.
- **Shared voice and text actions:** existing on-device speech recognition produces a transcript that enters the same validated action pipeline. Voice deletion requests display a transcript and confirmation. Raw audio is not sent to Nebius or Tavily.
- **Faster goal matching:** explicit focus, user rules, local relevance and recent work context resolve direction before using Nemotron for ambiguity. Stable local switches target about 30 seconds; ambiguous matching becomes eligible around 60 seconds, with cooldown and provider latency additional.
- **Contextual research:** stuck assistance offers to search first. After consent, Nemotron forms a minimal query, Tavily returns validated sources, and Nemotron synthesizes advice for the current step. Results attach to that goal's checkpoint; ratings become scoped feedback. Research alone never completes work.
- **Daily continuity:** priorities, yesterday's stopping point, waiting items, remaining work and daily results come from recorded facts across goals. New completions distinguish manual actions from AI suggestions confirmed by the user. Time alone is never completion evidence.
- **Conservative personalization:** sufficient confirmed feedback changes offer frequency; explicit preferences take precedence. This uses local memory and policy, not model fine-tuning.
- **Personal AI Engine:** a collapsed Settings → Integrations / AI panel shows safe runtime diagnostics and separates the configured model from optional provider-reported metadata. A manual synthetic inference check validates a real strict-schema response, with timeout, cooldown and no user context.

Existing goals, chats, activity and progress are retained by additive migrations. Persistent memory is local SQLite and is not encrypted at rest. Consented activity can include window/tab titles. Memory controls are separate from chat/activity history deletion and provider retention.

The release uses the existing trusted update-signing channels. Older Windows installations may require their existing signed bridge updates before reaching the current channel; signature verification is not relaxed.

Validation includes frontend and Rust regressions, mocked provider integrations, persistent two-goal hero workflow, idle stress, release/signing checks and native platform CI builds. These checks do not establish perfect live-model interpretation, real microphone/Accessibility behavior on every device or successful in-app installation/restart on every supported OS. Use the manual inference check to verify your configured Nebius account.
