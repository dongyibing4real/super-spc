# TODOS

## CSS Modularization
**What:** Split `src/styles.css` (3,420 lines) into component-scoped CSS files.
**Why:** After JS modularization lands, CSS is the next structural concentration risk. A single file makes it hard to reason about which styles belong to which component.
**Pros:** Easier maintenance, component-level style isolation, reduced merge conflicts.
**Cons:** Need to decide on strategy (CSS modules, BEM scoping, or just file splitting). Low urgency.
**Context:** The JS refactor (store + domain split) does not touch CSS. This is the natural follow-up once the JS architecture is clean. Consider splitting along the same boundaries as the component tree: chart/, views/, components/.
**Depends on:** JS architecture refactor (Phases 0-5) should land first.
**Added:** 2026-04-02
