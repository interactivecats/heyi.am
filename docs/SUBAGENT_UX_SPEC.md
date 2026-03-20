# Subagent Visualization: UX Design Spec

Built on the Calibrated Archive design system — tonal layering, no border separators, monospace labels, Space Grotesk / Inter / IBM Plex Mono.

## Core Principle: The Delegation Record

Multi-agent sessions are a documentation pattern. The parent session is an orchestration record; child sessions are implementation records. The visual language treats this like architecture docs vs. implementation PRs: parent shows *what was decided and why*, children show *what was built and how*.

Key metaphor: **indentation = delegation depth**.

---

## 1. Session Browser (CLI App — SessionList.tsx)

### List Hierarchy

Parent sessions appear as normal rows. Child sessions appear **indented beneath their parent**, collapsed by default.

**Parent row (extended):**
```
[session-browser__row]
  Title: "Build the auth system"
  Meta: "Mar 20 · 38 min · 3 agents"    ← agent count badge
  Status chip: ENHANCED / DRAFT / etc.
  Arrow: →
```

"3 agents" indicator: `var(--font-mono)`, 0.6875rem, `var(--on-surface-variant)`, after existing "turns" metadata.

**Expand/collapse:** Disclosure triangle (▸/▾) left of parent title, `var(--on-surface-variant)`, 0.75rem. Default: collapsed.

**Child rows (`session-browser__row--child`):**
- Left padding: `var(--spacing-8)` (2rem indent)
- Thin vertical connector: 1px solid `var(--outline-variant)` at 30% opacity
- Role label before title: `FRONTEND-DEV Built login UI`
  - Role: `var(--font-mono)`, 0.6875rem, `var(--primary)`, uppercase
  - Title: `var(--on-surface-variant)` (lighter than parent)
- Shows: role, title, duration, LOC — NO status chip (inherits parent's)

**15+ subagents:** Show first 5, then "... 10 more agents" link in mono/primary.

**Preview panel:**
- Parent selected → orchestration summary (delegation list + outcomes)
- Child selected → child's raw log

### CSS Classes
```
.session-browser__row--parent
.session-browser__row--child
.session-browser__connector
.session-browser__agent-count
.session-browser__child-role
.session-browser__expand-more
```

---

## 2. Case Study Page (show.html.heex)

### Detection
Renders standard case study when no children. Zero visual change for single-agent sessions.

### Orchestration Badge (below title)
```
ORCHESTRATED · 3 AGENTS · 792 LOC TOTAL · 38 MIN
```

`chip--orchestrated`:
- Background: `var(--primary-fixed)` (#d0e4ff)
- Text: `var(--primary)` (#084471)
- Font: mono, 0.625rem, uppercase, letter-spacing 0.08em

### Agent Contributions Section
Below the 4-stat strip:

```
LABEL-MONO: "Agent Contributions"

FRONTEND-DEV    Built login UI           247 LOC   12 min
BACKEND-DEV     Built API endpoints      389 LOC   18 min
QA-ENGINEER     Wrote test suite         156 LOC    8 min
```

Component: `agent-contributions`
- No card wrapper — sits on page surface
- Flex rows: role (mono, primary, 8rem) | description (body, flex:1) | LOC (mono, 5rem) | duration (mono, 4rem)
- Spacing: `var(--spacing-3)` between rows
- Alternating rows: odd = `var(--surface-container-low)`, even = transparent

### Execution Path Extension
Agent delegation steps show role label in `var(--primary)` mono:
```
03  Delegate UI implementation
    FRONTEND-DEV →
```
Arrow indicates step produced a child session. Role label links to child's case study.

### Developer Take Extension
Optional "ORCHESTRATION NOTES" sub-section below main take:
```
ORCHESTRATION NOTES
"The key decision was running frontend and backend in parallel..."
```
Only renders if dev provides orchestration notes.

### Child Session Links (Collapsible)
Uses existing `<details class="collapsible">` pattern:
```
Agent sessions (3 sessions)
  ▸ frontend-dev: Built login UI — 247 LOC, 12 min    [View →]
  ▸ backend-dev: Built API endpoints — 389 LOC, 18 min [View →]
  ▸ qa-engineer: Wrote test suite — 156 LOC, 8 min     [View →]
```

---

## 3. Transcript / Deep Dive

### Agent Spawn Block (Parent Transcript)

When transcript encounters an Agent tool call:

```
┌─ AGENT SPAWNED ─────────────────────────────────
│  Role: frontend-dev
│  Task: "Build the login UI with email/password form,
│         OAuth buttons, and error states"
│
│  Result: 247 LOC across 4 files, 12 min
│  [View full transcript →]
└──────────────────────────────────────────────────
```

Component: `transcript-agent-block`
- Background: `var(--surface-container-low)`
- Left accent: 3px solid `var(--primary)`
- All text: `var(--font-mono)`, 0.75rem
- "AGENT SPAWNED": `var(--primary)`, 0.625rem, uppercase
- Padding: `var(--spacing-4)`, radius: `var(--radius-sm)`
- "View full transcript" navigates to child page (no inline expand)

### Child Transcript Breadcrumb
```
← parent-session-title / frontend-dev
```
Link in `var(--primary)`, role in `var(--on-surface-variant)` mono.

### Agent Index (Top of Parent Transcript)
Horizontal row of role chips as jump links:
```
AGENTS:  [FRONTEND-DEV]  [BACKEND-DEV]  [QA-ENGINEER]
```
Chips: `var(--surface-container-low)` bg, `var(--primary)` mono, 0.625rem. Click scrolls to spawn block.

---

## 4. Portfolio Page

### AI Collaboration Profile
Orchestration dimension already exists. Multi-agent usage naturally increases this score. No visual changes needed.

### Project Cards — Agent Usage
Extend metadata row:
```
12 sessions · 3 orchestrated · 340m total · 2,847 LOC
```
"3 orchestrated" only appears if count > 0.

### Recent Activity (Sidebar)
```
Built auth system (3 agents)     Mar 20
```
"(3 agents)" in `var(--on-surface-variant)`.

---

## 5. Mobile (375px)

### Session Browser
- Single column (no preview panel)
- Child indent reduced: `var(--spacing-6)`
- Connector line hidden
- Agent count badge wraps to own line

### Case Study
- Agent contributions stack vertically per agent:
  ```
  FRONTEND-DEV
  Built login UI
  247 LOC · 12 min
  ```

### Transcript
- Agent index chips wrap to multiple rows
- Agent spawn blocks full width, left accent remains

---

## 6. Component Summary

| Component | Surface | Description |
|---|---|---|
| `session-browser__row--child` | CLI | Indented child row with role label |
| `session-browser__connector` | CLI | Vertical line connecting children |
| `chip--orchestrated` | Case study | Orchestration badge |
| `agent-contributions` | Case study | Delegation breakdown table |
| `transcript-agent-block` | Transcript | Agent spawn indicator |
| `transcript-agent-index` | Transcript | Horizontal jump-link chips |
| `case-study-breadcrumb` | Transcript (child) | Parent → child navigation |

No new design tokens — uses existing system.

---

## 7. Data Requirements

- `session.children`: `[{role, title, loc, duration_minutes, token}]`
- `session.parent_token`: string | nil (for breadcrumb)
- `session.is_orchestrated`: derived from `length(children) > 0`
- Transcript agent tool calls tagged with child session token (for "View full transcript" links)
