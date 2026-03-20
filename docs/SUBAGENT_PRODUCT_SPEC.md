# Subagent Sessions: Product Specification

## One-Sentence Summary

Surface orchestration as a first-class skill signal, nest subagent sessions under the parent with aggregated-plus-attributed stats, and keep the MVP scope razor-thin.

---

## 1. What Orchestration Skill Signals

Orchestration is the highest-leverage AI collaboration skill a developer can demonstrate:

- **Problem decomposition** — breaking a vague goal into parallelizable subtasks
- **Delegation judgment** — knowing what to hand off vs. what to do yourself
- **Coordination and verification** — reviewing agent output, catching errors, reconciling conflicts
- **Resource efficiency** — completing more work in less wall-clock time

This is directly analogous to how senior engineers are evaluated: not by lines they personally wrote, but by how effectively they directed work.

---

## 2. Hierarchy: Nested Under Parent

Parent session is the primary view. Subagent sessions are expandable children — visible but subordinate.

| Option | Verdict | Rationale |
|--------|---------|-----------|
| Hidden (parent only) | Reject | Throws away the actual implementation evidence |
| Flat with "spawned by" link | Reject | Loses the orchestration narrative |
| Aggregated into parent | Reject | Misleading — makes it look like one agent did everything |
| **Nested under parent** | **Accept** | Preserves orchestration story AND implementation evidence |

Key insight: **the user rarely writes directly to the subagent**. They have their main agent call the subagents. So the default view shows the delegation prompt + outcome summary. Full child transcripts are drill-down detail.

---

## 3. Stats: Dual Display with Clear Attribution

Show **both** aggregated and attributed numbers.

**Parent card displays:**
- `Total: 2,000 LOC across 3 agents in 45 min` (aggregated, clearly labeled)
- `Orchestration: 12 delegations, 8 verification checks, 3 course corrections` (parent-specific)

**Expanded child cards display:**
- Individual stats per agent (LOC, files, duration, tools)

**Rule:** Aggregated numbers always carry the label "across N agents" — never presented as if one person typed 2,000 lines.

---

## 4. Orchestration as a Skill Dimension

Add "Orchestration" to the AI Collaboration Profile. Dimensions to track:

- **Decomposition quality** — Did the dev break the problem into coherent, independent subtasks?
- **Delegation specificity** — Were instructions to agents clear and scoped?
- **Verification depth** — Did the dev review agent output or blindly accept?
- **Coordination overhead** — How efficiently was work coordinated?

This is a pattern description, NOT a score: "Tends to decompose into 3-5 focused agents with explicit acceptance criteria."

---

## 5. Cross-Tool Applicability

This is NOT Claude-only. The parent→child pattern is universal:

| Tool | Multi-agent pattern |
|------|-------------------|
| Claude Code | `Agent` tool spawns subagents with own .jsonl files |
| Cursor | Background agents run tasks in parallel |
| Codex | Spawns sandbox agents for parallel tasks |
| Devin | Multi-step plans spawn child processes |
| Gemini CLI | Agent tool similar to Claude Code |

The `Session` type gets `childSessions` and `parentSessionId` — parser-agnostic. Each parser implements child detection for its own file structure.

---

## 6. MVP vs Later

### MVP (ship first)
- Parser detects subagent directory structure and links children to parent
- `Session` type gains `childSessions?: Session[]` and `parentSessionId?: string`
- Session browser: parent rows show "N agents" badge, expand to show children
- Case study: "ORCHESTRATED" chip + agent contributions table
- Transcript: agent spawn blocks with role/task/result summary

### V2 (ship after validation)
- Orchestration dimension in AI Collaboration Profile (needs 5+ sessions)
- Visual delegation timeline (Gantt-like parallel agent view)
- Cross-agent file conflict detection
- Orchestration-specific AI enhancement questions

### Not Now
- Comparing orchestration styles across developers
- "Orchestration score" or ranking
- Auto-suggestions for better delegation strategies

---

## 7. Data Model Requirements

```typescript
// Session type additions
interface Session {
  // ... existing fields ...
  childSessions?: Session[];
  parentSessionId?: string | null;
  agentRole?: string;        // e.g., "frontend-dev", only set on child sessions
  isOrchestrated?: boolean;  // derived: childSessions.length > 0
}
```

Parser additions:
- `SessionParser` gets optional `parseChildren(path: string): Promise<SessionAnalysis[]>`
- Claude parser: scans `{sessionId}/subagents/*.jsonl`
- Other parsers: implement child detection for their own structures
