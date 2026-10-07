# Desktop Buddy 0.19.0

New goals automatically receive a title suggestion, 3–5 steps and grounded web sources when research is useful. Accept the title, individual steps, selected steps or all steps; saved suggestions survive reopening and step edits. AI assistance and Today context default to on, with existing opt-outs preserved.

Today tracking starts after consent without a manual timer. Conservative local matches connect visible app/page/document activity to open Today goals. Only sufficiently relevant activity adds progress; observed time stays separate. Progress adds a timestamped local timeline and summaries of completed/unfinished goals and relevant minutes. Completion stops attribution and notifies Buddy.

Buddy chat uses Today goals, steps, progress, relevant app totals and recent history. Replies validate their structure, allow one repair request and provide safe retry guidance. Stuck offers and cooldown adapt using local progress and explicit feedback. Duration estimates are shown only as supported ranges.

Developer 1 interfaces are exported from `src/ai/contracts.ts`. Provider keys remain runtime-only. The primary/developer2 update trust and compatibility channels are unchanged. See [the implementation guide](AI_BUDDY_TAVILY_TRACKING.md) for consent, matching limitations and verification.

This release covers Developer 2 only. Developer 1 onboarding/settings redesign and backlog learning/research/reporting features are outside this implementation.
