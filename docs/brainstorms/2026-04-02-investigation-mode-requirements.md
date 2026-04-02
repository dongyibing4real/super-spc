---
date: 2026-04-02
topic: investigation-mode
---

# Investigation Mode — Closed-Loop Violation Workflow

## Problem Frame

Process engineers detect violations (red points, rule tags, findings cards) but have no tool-supported workflow for what comes next: confirming the signal, investigating root cause, documenting corrective action, and excluding points with an audit trail. This is where SPC programs die in practice — detection without disposition. Investigation Mode closes that loop inside the app.

## Requirements

**Workspace Quick Triage (Evidence Rail)**

- R1. Each violation item in the evidence rail's "Violations" section becomes a clickable button. Clicking a violation navigates the focused chart to center the affected points — composing `selectPoint` + `setXDomainOverride` to zoom the relevant region into view with a smooth D3 transition.
- R2. When a violation item is clicked and the affected points span a range, the chart zooms to show all affected indices with padding (±10% of range), and the affected points are multi-selected.
- R3. Rule tags (R1, R2, etc.) in the signal hero are also clickable with the same navigation behavior as R1.
- R4. Each violation item in the rail shows a compact status indicator (dot or icon) reflecting its investigation status: Open (no indicator), Confirmed (blue dot), Investigating (amber dot), Resolved (green check), Dismissed (gray dash).
- R5. Quick-action buttons appear inline next to each violation when hovered or focused: "Confirm" and "Dismiss." These advance the investigation status without leaving the workspace.
- R6. Dismissing from the rail requires a one-line reason (inline text input that appears on click, not a modal). Confirming requires no additional input.
- R7. A "View in Findings" link appears in the rail for any violation that has been confirmed or is under investigation, linking to the deep investigation panel on the findings page.
- R8. Chart points that are part of an active investigation show a subtle visual indicator layered on top of the existing OOC styling — a small status icon (e.g., magnifying glass for Investigating, check for Resolved) rendered as an SVG overlay in the points layer.
- R9. The evidence rail's violation list is sorted by severity (unresolved first, then by rule number), with investigation status as secondary sort.

**Findings Page Deep Investigation**

- R10. The existing finding detail panel on the findings page gains an "Investigation" section below the current metric/context display.
- R11. The investigation section shows the current status with a progression indicator: Open → Confirmed → Investigating → Resolved (or Dismissed from any pre-Resolved state). Status is advanced via a single primary action button ("Confirm", "Begin Investigation", "Mark Resolved").
- R12. When status is Investigating or later, the investigation section shows a root cause form: category dropdown (from user-defined taxonomy) + free-text detail field.
- R13. When status is Investigating or later, a "Corrective Action" text area appears for documenting what was done to address the root cause.
- R14. A chronological timeline at the bottom of the investigation section shows all state transitions with timestamps and the user action that triggered each transition (e.g., "Confirmed — Apr 2, 2026", "Root cause assigned: Machine — Bearing wear on spindle 3").
- R15. Finding cards in the left column show investigation status via the same dot/icon system as R4. Cards with unresolved investigations sort to the top.
- R16. The health bar at the top of findings page shows an investigation summary: "3 of 7 violations resolved" or similar.
- R17. Clicking a finding card that has an investigation opens directly to the investigation section (scrolled into view), not the default metric display.
- R18. The "Dismiss" action from findings page requires a reason category (from the same taxonomy) + optional detail, creating a more thorough dismissal record than the quick rail dismiss (R6).
- R19. All investigation state transitions are logged as audit events with timestamp, previous state, new state, and any associated data (reason, root cause, corrective action).
- R20. Investigation records are associated with a specific chart ID, dataset ID, and violation (testId + point indices), creating a unique key per investigation.

**Annotations and Notes**

- R21. Users can attach a text annotation to any single point or contiguous range of points via the context menu ("Add Note") or from the investigation panel.
- R22. Annotations appear in the evidence rail's point tier when the annotated point is selected, below the signal hero section.
- R23. On the chart, annotated points show a small gold diamond marker above the point circle. This is a new SVG layer (between points and selection layers in the z-order).
- R24. Annotations have a timestamp and are editable after creation.
- R25. Annotations can optionally be linked to an investigation record (auto-linked when created from the investigation panel).
- R26. The evidence rail shows an "Annotations" section below the chart tier listing all annotations for the focused chart, each clickable to navigate to that point (same behavior as R1).
- R27. The findings page shows an "Annotations" tab or section listing all annotations for the selected chart, filterable by date range and linked investigation status.
- R28. Annotations render on the chart regardless of whether the annotated point is currently selected (always visible, toggleable via chart toggles like existing event markers).

**Exclusion Integration**

- R29. The existing "Exclude point" context menu action is replaced with "Exclude with reason." Clicking it opens an inline form in the evidence rail (not a modal) with: reason category (from taxonomy) + optional detail text + "Exclude" button.
- R30. If the point is part of an active investigation, the exclusion is auto-linked to that investigation record. If not, a new investigation record is created with status "Resolved" and the exclusion as the resolution.
- R31. Excluded points that have investigation records show their reason in the evidence rail when selected (in the point tier, below the signal hero).
- R32. "Restore point" (un-exclude) also requires a reason, logged as an audit event on the investigation record.
- R33. The findings page shows excluded points in a dedicated section with their reasons, linked investigations, and restore actions.
- R34. Exclusion state is persisted to the backend and survives page reload. On dataset load, exclusion state is fetched and applied to the points array.
- R35. Bulk exclusion (from marquee selection) opens the same form as R29, applying the same reason to all selected points and creating/linking investigation records for each.

**Root Cause Taxonomy**

- R36. Each dataset has its own root cause category list. New datasets start with the 6M/Ishikawa defaults: Material, Machine, Method, Man (Operator), Environment, Measurement.
- R37. Users can add new categories, rename existing ones, and archive categories (archived categories are hidden from new selections but preserved on existing records).
- R38. Category management is accessible from the findings page via a "Manage Categories" button.
- R39. Categories track usage frequency for future Pareto analysis (count of times each category is assigned as root cause).

**Persistence**

- R40. Investigation records (status, root cause, corrective action, timeline events) are stored in the backend via new API endpoints.
- R41. Annotations are stored in the backend, associated with dataset ID, chart ID, and point index/range.
- R42. Root cause categories are stored per dataset in the backend.
- R43. Point exclusion state (excluded boolean + reason + investigation link) is stored in the backend per dataset + point index.
- R44. On dataset load, the frontend fetches investigation records, annotations, exclusions, and categories and merges them into the runtime state.

## Success Criteria

- SC1. A process engineer can go from seeing a red point on the chart to a documented, resolved investigation with root cause and corrective action without leaving the app.
- SC2. Every point exclusion has a persisted reason and audit trail that survives page reload.
- SC3. The evidence rail feels interactive, not passive — violations are entry points to investigation, not dead-end labels.
- SC4. Investigation state is visible at a glance on both the chart (point indicators) and the findings page (status dots on cards, summary in health bar).
- SC5. The workflow is low-friction: quick triage in the workspace takes <3 clicks, deep investigation on findings page is a natural continuation, not a context switch.

## Scope Boundaries

**In scope:**
- Workspace quick triage (clickable violations, inline confirm/dismiss)
- Findings page deep investigation (root cause, corrective action, timeline)
- Annotations on points/ranges
- Exclusion tied to investigation with audit trail
- User-defined root cause taxonomy per dataset
- Backend persistence for all investigation data

**Out of scope (deferred):**
- Email/webhook notifications on investigation state changes
- Role-based access control (who can confirm vs. resolve)
- Batch investigation (resolve multiple violations at once with same root cause)
- Investigation templates (pre-filled forms for common scenarios)
- Export investigation records to PDF/CSV (separate from Export Pipeline feature)
- Cross-chart investigation linking (one root cause affecting multiple charts)
- SPC compliance reporting (FDA 21 CFR Part 11, ISO 13485)
- Real-time collaboration on investigations
- AI-assisted root cause suggestion

## Key Decisions

- **Layered investigation surfaces:** Quick triage in workspace rail, deep investigation on findings page. One investigation record serves both surfaces.
- **Full workflow states:** Open → Confirmed → Investigating → Resolved / Dismissed. Forward-only transitions (no reopening resolved investigations in V1).
- **Exclusion requires disposition:** No more ephemeral toggle. Every exclusion gets a reason and an audit trail.
- **User-defined taxonomy:** Categories are per-dataset, starting with 6M defaults. Flexibility over standardization.
- **Backend persistence:** Investigation data is too important for localStorage. SQLite via existing FastAPI backend.

## Outstanding Questions

### Deferred to Planning
- [Affects R40-R44][Technical] What API endpoint structure best serves investigation CRUD?
- [Affects R8, R23][Technical] What SVG layer z-order for investigation indicators and annotation markers?
- [Affects R34][Needs research] How should exclusion state sync between frontend runtime and backend on initial load?
- [Affects R14][Technical] Should the timeline be stored as denormalized events or derived from audit log?
- [Affects R1-R3][Technical] What D3 transition duration and easing for the "navigate to violation" animation?

## Next Steps

→ `/ce:plan` for structured implementation planning
