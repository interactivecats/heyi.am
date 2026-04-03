/**
 * Scope template CSS to a container using @scope.
 * Extracts @keyframes (which break inside @scope) and appends them outside.
 */
export function scopeTemplateCss(css: string, containerId: string): string {
  // Extract @keyframes — they don't work inside @scope blocks
  const keyframes: string[] = []
  const re = /@keyframes\s+[\w-]+\s*\{/g
  let found
  const ranges: Array<[number, number]> = []
  while ((found = re.exec(css)) !== null) {
    let depth = 1
    let i = found.index + found[0].length
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth++
      else if (css[i] === '}') depth--
      i++
    }
    keyframes.push(css.substring(found.index, i))
    ranges.push([found.index, i])
  }

  // Remove keyframes from source (reverse order to preserve indices)
  let scoped = css
  for (let j = ranges.length - 1; j >= 0; j--) {
    scoped = scoped.substring(0, ranges[j][0]) + scoped.substring(ranges[j][1])
  }

  // Remap :root/body to :scope, strip universal reset
  scoped = scoped
    .replace(/(?:^|\n)\s*:root\s*\{/g, '\n:scope {')
    .replace(/(?:^|\n)\s*body\s*\{/g, '\n:scope {')
    .replace(/\*\s*,\s*\*::before\s*,\s*\*::after\s*\{[^}]*\}/g, '')

  return `@scope (#${containerId}) {\n${scoped}\n}\n${keyframes.join('\n')}`
}

/** Selector for template elements that use scroll-triggered animation reveals. */
export const REVEAL_SELECTOR =
  '[class*="-section"], [class*="sc-"], [class*="-hero"], .fade-up, .fade-in, .reveal, [class*="anim-"], .strata-layer, [class*="cos-"]'
