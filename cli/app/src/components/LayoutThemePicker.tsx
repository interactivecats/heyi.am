/**
 * Theme dropdown + Layout wireframe thumbnails picker.
 * Theme selection auto-selects the theme's default layout.
 */

const THEMES = [
  { name: 'seal-blue', label: 'Seal Blue', accent: '#084471', bg: '#ffffff', defaultLayout: 'classic' },
  { name: 'warm-stone', label: 'Warm Stone', accent: '#1c1917', bg: '#fafaf9', defaultLayout: 'typography' },
  { name: 'ember', label: 'Ember', accent: '#f97316', bg: '#09090b', defaultLayout: 'stats-forward' },
  { name: 'matrix', label: 'Matrix', accent: '#4ade80', bg: '#0a0a0a', defaultLayout: 'command-line' },
  { name: 'midnight', label: 'Midnight', accent: '#3b82f6', bg: '#09090b', defaultLayout: 'stats-forward' },
  { name: 'twilight', label: 'Twilight', accent: '#a78bfa', bg: '#09090b', defaultLayout: 'classic' },
] as const

const LAYOUTS = [
  { name: 'classic', label: 'Classic' },
  { name: 'stats-forward', label: 'Stats-Forward' },
  { name: 'command-line', label: 'Command Line' },
  { name: 'typography', label: 'Typography' },
] as const

/** Tiny SVG wireframes showing layout structure */
function LayoutWireframe({ layout, selected }: { layout: string; selected: boolean }) {
  const stroke = selected ? 'var(--primary, #084471)' : 'var(--outline-variant, #c2c7d0)'
  const fill = selected ? 'var(--primary-fixed, #d0e4ff)' : 'var(--surface-container-low, #f3f4f6)'
  const bg = selected ? 'var(--surface-container-lowest, #fff)' : 'var(--surface-container, #edeef0)'

  const wireframes: Record<string, JSX.Element> = {
    classic: (
      <svg viewBox="0 0 48 56" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="48" height="56" rx="2" fill={bg} />
        <rect x="4" y="4" width="20" height="2.5" rx="0.5" fill={stroke} opacity="0.8" />
        <rect x="4" y="9" width="40" height="12" rx="1" fill={fill} stroke={stroke} strokeWidth="0.5" />
        <rect x="4" y="24" width="40" height="6" rx="1" fill={fill} stroke={stroke} strokeWidth="0.5" />
        <rect x="4" y="33" width="12" height="5" rx="0.5" fill={fill} stroke={stroke} strokeWidth="0.5" />
        <rect x="18" y="33" width="12" height="5" rx="0.5" fill={fill} stroke={stroke} strokeWidth="0.5" />
        <rect x="32" y="33" width="12" height="5" rx="0.5" fill={fill} stroke={stroke} strokeWidth="0.5" />
        <rect x="4" y="41" width="19" height="6" rx="0.5" fill={fill} stroke={stroke} strokeWidth="0.5" />
        <rect x="25" y="41" width="19" height="6" rx="0.5" fill={fill} stroke={stroke} strokeWidth="0.5" />
        <rect x="4" y="49" width="19" height="4" rx="0.5" fill={fill} stroke={stroke} strokeWidth="0.5" />
        <rect x="25" y="49" width="19" height="4" rx="0.5" fill={fill} stroke={stroke} strokeWidth="0.5" />
      </svg>
    ),
    'stats-forward': (
      <svg viewBox="0 0 48 56" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="48" height="56" rx="2" fill={bg} />
        <rect x="4" y="4" width="16" height="2.5" rx="0.5" fill={stroke} opacity="0.8" />
        <rect x="4" y="8" width="10" height="1.5" rx="0.3" fill={stroke} opacity="0.3" />
        <rect x="30" y="4" width="6" height="4" rx="0.5" fill={fill} stroke={stroke} strokeWidth="0.5" />
        <rect x="38" y="4" width="6" height="4" rx="0.5" fill={fill} stroke={stroke} strokeWidth="0.5" />
        <line x1="4" y1="14" x2="4" y2="22" stroke={stroke} strokeWidth="1" opacity="0.5" />
        <rect x="6" y="14" width="34" height="1.5" rx="0.3" fill={stroke} opacity="0.2" />
        <rect x="6" y="17" width="30" height="1.5" rx="0.3" fill={stroke} opacity="0.2" />
        <rect x="6" y="20" width="26" height="1.5" rx="0.3" fill={stroke} opacity="0.2" />
        <rect x="4" y="26" width="40" height="7" rx="1" fill={fill} stroke={stroke} strokeWidth="0.5" />
        <rect x="4" y="36" width="22" height="10" rx="1" fill={fill} stroke={stroke} strokeWidth="0.5" />
        <rect x="28" y="36" width="16" height="10" rx="1" fill={fill} stroke={stroke} strokeWidth="0.5" />
        <rect x="4" y="49" width="19" height="4" rx="0.5" fill={fill} stroke={stroke} strokeWidth="0.5" />
        <rect x="25" y="49" width="19" height="4" rx="0.5" fill={fill} stroke={stroke} strokeWidth="0.5" />
      </svg>
    ),
    'command-line': (
      <svg viewBox="0 0 48 56" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="48" height="56" rx="2" fill={bg} />
        <rect x="4" y="4" width="1.5" height="1.5" rx="0.3" fill={stroke} opacity="0.6" />
        <rect x="7" y="4" width="14" height="1.5" rx="0.3" fill={stroke} opacity="0.4" />
        <rect x="4" y="8" width="40" height="8" rx="1" fill={fill} stroke={stroke} strokeWidth="0.5" />
        <rect x="4" y="19" width="40" height="5" rx="0.5" fill={fill} stroke={stroke} strokeWidth="0.5" />
        <line x1="4" y1="27" x2="4" y2="35" stroke={stroke} strokeWidth="1" opacity="0.5" />
        <rect x="6" y="27" width="30" height="1" rx="0.3" fill={stroke} opacity="0.2" />
        <rect x="6" y="29.5" width="26" height="1" rx="0.3" fill={stroke} opacity="0.2" />
        <rect x="6" y="32" width="28" height="1" rx="0.3" fill={stroke} opacity="0.2" />
        <line x1="5" y1="38" x2="5" y2="48" stroke={stroke} strokeWidth="0.5" opacity="0.4" />
        <line x1="5" y1="39" x2="8" y2="39" stroke={stroke} strokeWidth="0.5" opacity="0.4" />
        <rect x="9" y="38" width="16" height="1.5" rx="0.3" fill={stroke} opacity="0.3" />
        <line x1="5" y1="42" x2="8" y2="42" stroke={stroke} strokeWidth="0.5" opacity="0.4" />
        <rect x="9" y="41" width="14" height="1.5" rx="0.3" fill={stroke} opacity="0.3" />
        <line x1="5" y1="45" x2="8" y2="45" stroke={stroke} strokeWidth="0.5" opacity="0.4" />
        <rect x="9" y="44" width="18" height="1.5" rx="0.3" fill={stroke} opacity="0.3" />
        <line x1="5" y1="48" x2="8" y2="48" stroke={stroke} strokeWidth="0.5" opacity="0.4" />
        <rect x="9" y="47" width="12" height="1.5" rx="0.3" fill={stroke} opacity="0.3" />
        <rect x="4" y="51" width="40" height="2" rx="0.3" fill={fill} stroke={stroke} strokeWidth="0.3" />
      </svg>
    ),
    typography: (
      <svg viewBox="0 0 48 56" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="48" height="56" rx="2" fill={bg} />
        <rect x="4" y="6" width="24" height="4" rx="0.5" fill={stroke} opacity="0.7" />
        <rect x="4" y="13" width="36" height="1" rx="0.3" fill={stroke} opacity="0.2" />
        <line x1="4" y1="17" x2="12" y2="17" stroke={stroke} strokeWidth="0.5" opacity="0.4" />
        <rect x="4" y="20" width="36" height="1" rx="0.3" fill={stroke} opacity="0.15" />
        <rect x="4" y="22.5" width="32" height="1" rx="0.3" fill={stroke} opacity="0.15" />
        <rect x="4" y="25" width="34" height="1" rx="0.3" fill={stroke} opacity="0.15" />
        <rect x="4" y="27.5" width="28" height="1" rx="0.3" fill={stroke} opacity="0.15" />
        <line x1="4" y1="32" x2="12" y2="32" stroke={stroke} strokeWidth="0.5" opacity="0.4" />
        <rect x="4" y="35" width="8" height="1" rx="0.3" fill={stroke} opacity="0.2" />
        <rect x="14" y="35" width="20" height="1" rx="0.3" fill={stroke} opacity="0.15" />
        <line x1="4" y1="38" x2="44" y2="38" stroke={stroke} strokeWidth="0.3" opacity="0.15" />
        <rect x="4" y="40" width="8" height="1" rx="0.3" fill={stroke} opacity="0.2" />
        <rect x="14" y="40" width="18" height="1" rx="0.3" fill={stroke} opacity="0.15" />
        <line x1="4" y1="43" x2="44" y2="43" stroke={stroke} strokeWidth="0.3" opacity="0.15" />
        <rect x="4" y="46" width="30" height="1.5" rx="0.3" fill={stroke} opacity="0.2" />
        <line x1="4" y1="49.5" x2="44" y2="49.5" stroke={stroke} strokeWidth="0.3" opacity="0.15" />
        <rect x="4" y="51" width="26" height="1.5" rx="0.3" fill={stroke} opacity="0.2" />
      </svg>
    ),
  }

  return wireframes[layout] || wireframes.classic
}

interface LayoutThemePickerProps {
  layout: string
  theme: string
  onLayoutChange: (layout: string) => void
  onThemeChange: (theme: string) => void
}

export function LayoutThemePicker({ layout, theme, onLayoutChange, onThemeChange }: LayoutThemePickerProps) {
  return (
    <div>
      {/* Theme selector (first) */}
      <div className="mb-4">
        <div className="font-mono text-[9px] uppercase tracking-wider text-outline mb-1.5">Theme</div>
        <select
          value={theme}
          onChange={(e) => onThemeChange(e.target.value)}
          className="w-full text-xs font-mono px-2 py-1.5 rounded-sm border border-ghost bg-surface-lowest text-on-surface appearance-none cursor-pointer"
          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M3 5l3 3 3-3' fill='none' stroke='%2372787e' stroke-width='1.5'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
        >
          {THEMES.map((t) => (
            <option key={t.name} value={t.name}>{t.label}</option>
          ))}
        </select>
        <div className="flex gap-1 mt-1.5">
          {THEMES.filter((t) => t.name === theme).map((t) => (
            <div key={t.name} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm border border-ghost" style={{ backgroundColor: t.bg }} />
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: t.accent }} />
              <span className="text-[9px] text-on-surface-variant font-mono">{t.accent}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Layout selector (second) */}
      <div>
        <div className="font-mono text-[9px] uppercase tracking-wider text-outline mb-2">Layout</div>
        <div className="grid grid-cols-2 gap-1.5">
          {LAYOUTS.map((l) => (
            <button
              key={l.name}
              type="button"
              onClick={() => onLayoutChange(l.name)}
              className={`flex flex-col items-center gap-1 p-1.5 rounded-md border transition-colors ${
                layout === l.name
                  ? 'border-primary bg-primary-fixed/10'
                  : 'border-ghost bg-surface-lowest hover:border-outline-variant'
              }`}
            >
              <div className="w-full" style={{ maxWidth: 48 }}>
                <LayoutWireframe layout={l.name} selected={layout === l.name} />
              </div>
              <span className={`text-[9px] font-mono ${
                layout === l.name ? 'text-primary font-medium' : 'text-on-surface-variant'
              }`}>
                {l.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
