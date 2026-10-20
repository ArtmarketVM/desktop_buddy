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

The eight stylesheets initially contain **8,953 lines**. Across the five globals, the audit counted **1,776 individual selector occurrences, 1,358 distinct selectors and 280 selectors occurring more than once**, including legitimate responsive/state rules. Across all eight files, there are **14 important declarations**, **17 literal font-size declarations** (including two `clamp` values), and **five 600-weight declarations**. Counts are derived from parsed CSS, excluding keyframe steps; grouped selectors are counted individually.

Repeated selectors are not automatically interchangeable: equal-specificity selectors, shorthands, media queries and component styles can depend on their position. Consolidation must preserve those ordering constraints rather than treating the last rule as a complete replacement.

## Coordination

No selector is renamed or removed from the component contract, and no TSX/import change is planned. Developer 2 can preserve the existing DOM and class names. Developer 3's infrastructure should land first; this branch must then be rebased and checked against their reviewed fixtures before merge. Local reference screenshots must not be substituted for Linux CI baselines.

## Validation record

Implementation, exact commands, exception inventory, visual evidence and remaining platform limitations are recorded below as milestones complete. No push, PR, release or installer is authorized in this task.

### Milestone: shared tokens

- Moved the four primary type sizes/leading values from `style.css` to `workspace.css`.
- Preserved special typography through named tokens, including all five 600-weight declarations. See the owner-decision list in `TYPOGRAPHY.md`.
- Centralized 35 fixed color values in addition to the existing semantic palette. Fixed colors retain their original light/dark behavior; no palette substitution is made merely on a light-theme match.
- Centralized sidebar widths, toolbar size, page widths/gutters, title leading and square-switch geometry.
- Local reference matrix: 48 populated synthetic states, light/dark, 1280×873 and 600×873; shipped Instrument Sans 400/500/600 and Silkscreen 400 confirmed loaded. Before screenshots and fixture/replay tools are under the ignored `.tools/css-audit/` directory in this worktree.
- Computed-style comparison includes every standard computed property, element geometry and `::before`/`::after`, excluding newly added custom-property names. Hover transitions must settle before sampling both sides. No real credentials, activity or provider calls are used.
