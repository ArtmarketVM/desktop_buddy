# CSS consolidation — Developer 1

## Scope and base

- Branch: `codex/css-consolidation`.
- Base: `11760017314095d75374449690c2a1c42c5af08a` (`origin/main`, version 0.39.0), fetched before starting on October 20, 2026.
- The original checkout was 12 commits behind main. Its untracked `.DS_Store`, developer setup document and reports were preserved in that checkout; work is isolated in a managed worktree.
- Developer 1 owns the stylesheets and layout/typography documentation only. No application logic, DOM/class names, imports, manifests, CI, version, repository settings or installers are changed.
- Developer 3's reviewed visual infrastructure was not available at the start (confirmed by the owner). The permitted fallback is reproducible local before/after captures. These are supplementary browser checks, not Linux CI baselines or native platform acceptance.

## Initial cascade audit

Global import order in `src/main.tsx` must remain:

1. `src/style.css`: font imports, foundational elements, legacy onboarding/planner/activity views and initial companion geometry.
2. `src/workspace.css`: theme variables, workspace elements, sidebar, onboarding/profile/settings surfaces and semantic overrides.
3. `src/companion/companion.css`: companion chat, interventions and desktop controls.
4. `src/core/core.css`: Today, goals/steps, Progress, Chats-adjacent controls, Settings and accumulated surface refinements.
5. `src/compact.css`: shared column, sidebar and collapsed mode, conversation layout, native companion anchor/controls and late refinements.

Component imports are `companion/conversation.css` (Conversation), `ai/engine.css` (Personal AI Engine) and `coaching/coaching.css` (coaching components). Their cascade relationship to global styles must be preserved as well.

The eight stylesheets initially contain **8,953 lines**. Across the five globals, the audit counted **1,776 individual selector occurrences, 1,358 distinct selectors and 280 selectors occurring more than once**, including legitimate responsive/state rules. Across all eight files, there are **14 important declarations**, **16 literal font-size declarations** (including two `clamp` values), and **six 600-weight declarations**. Counts are derived from parsed CSS, excluding keyframe steps; grouped selectors are counted individually.

Repeated selectors are not automatically interchangeable: equal-specificity selectors, shorthands, media queries and component styles can depend on their position. Consolidation must preserve those ordering constraints rather than treating the last rule as a complete replacement.

## Coordination

No selector is renamed or removed from the component contract, and no TSX/import change is planned. Developer 2 can preserve the existing DOM and class names. Developer 3's infrastructure should land first; this branch must then be rebased and checked against their reviewed fixtures before merge. Local reference screenshots must not be substituted for Linux CI baselines.

## Validation record

Implementation, exact commands, exception inventory, visual evidence and remaining platform limitations are recorded below as milestones complete. No push, PR, release or installer is authorized in this task.
