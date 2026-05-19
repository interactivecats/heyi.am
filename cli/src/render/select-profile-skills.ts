/**
 * Pick which skills to show on a portfolio card.
 *
 * The full skill list still lives on the project detail page; this trims
 * the list to a handful for the dense card grid. Shared between the
 * publish flow (`portfolio-render-data.ts`) and the preview flow
 * (`preview.ts`) so what the user sees in the template browser matches
 * what they actually ship.
 */

/** Cap for the number of skill chips shown on a portfolio card. */
export const PROFILE_SKILL_CAP = 4;

export interface SelectProfileSkillsInput {
  /** Project-level skill list from AI enhancement (already deduped). */
  projectSkills: string[];
  /** Per-session skill arrays for this project (raw, may contain dupes). */
  sessionSkills: string[][];
}

/**
 * Return the capped, ranked subset of skills to render on the profile card.
 *
 * Ranks by **sessions-touched count** — the skill that appeared in the most
 * distinct sessions wins. A skill mentioned in 8 of 10 sessions ranks above
 * one mentioned in 1 of 10, regardless of how many times it appeared inside
 * any single session (so one verbose session can't dominate the ranking).
 * Ties are broken by the skill's order in `projectSkills` (stable, canonical).
 *
 * Invariants:
 *   - Output length ≤ PROFILE_SKILL_CAP.
 *   - Output is a subset of `projectSkills` (preserves canonical casing).
 *   - No duplicates.
 *   - Empty `projectSkills` → empty output.
 *   - Skills appearing in sessions but not in `projectSkills` are ignored
 *     (the enhance cache is the source of truth for which skills count).
 */
export function selectProfileSkills(input: SelectProfileSkillsInput): string[] {
  const { projectSkills, sessionSkills } = input;
  if (projectSkills.length === 0) return [];

  const canonical = new Set(projectSkills);
  const sessionsTouched = new Map<string, number>();
  for (const skill of projectSkills) sessionsTouched.set(skill, 0);

  for (const perSession of sessionSkills) {
    const seen = new Set<string>();
    for (const skill of perSession) {
      if (canonical.has(skill) && !seen.has(skill)) {
        seen.add(skill);
        sessionsTouched.set(skill, (sessionsTouched.get(skill) ?? 0) + 1);
      }
    }
  }

  const order = new Map(projectSkills.map((s, i) => [s, i]));
  return projectSkills
    .slice()
    .sort((a, b) => {
      const diff = (sessionsTouched.get(b) ?? 0) - (sessionsTouched.get(a) ?? 0);
      return diff !== 0 ? diff : (order.get(a) ?? 0) - (order.get(b) ?? 0);
    })
    .slice(0, PROFILE_SKILL_CAP);
}
