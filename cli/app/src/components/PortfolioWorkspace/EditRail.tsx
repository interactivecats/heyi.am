// EditRail — right column of the portfolio workspace.
//
// Six collapsible sections, fixed-width 360px, scrollable. Form fields are
// copied faithfully from Settings.tsx (Phase 3.5 deletes the source). Text
// fields commit on blur via UPDATE_PROFILE_FIELD; selects/checkboxes/file
// uploads commit on change. There is no save button — publishing persists.
//
// Dirty markers: any field whose current value differs from
// publishState.targets['heyi.am'].lastPublishedProfile[field] gets an amber
// left border (border-l-2 border-amber-500).
//
// Projects section uses @dnd-kit/sortable for user-curated drag-to-reorder.

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react'

/**
 * How long to wait after the last keystroke before persisting the profile
 * to disk. Short enough to feel near-live in the iframe, long enough to
 * coalesce rapid typing into a single write.
 */
const PROFILE_SAVE_DEBOUNCE_MS = 300
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { usePortfolioStore } from '../../hooks/usePortfolioStore'
import {
  fetchProjects,
  fetchTheme,
  savePortfolio,
  saveTheme,
  type PortfolioProfile,
  type Project,
} from '../../api'
import { TemplateBrowser } from '../TemplateBrowser'

// ── Helpers ──────────────────────────────────────────────────

const PHOTO_MAX_BYTES = 5 * 1024 * 1024
const RESUME_MAX_BYTES = 10 * 1024 * 1024

type TextField = Exclude<
  keyof PortfolioProfile,
  'photoBase64' | 'resumeBase64' | 'resumeFilename' | 'accent'
>

/** Empty string and undefined are equivalent for dirty comparison. */
function valuesDiffer(a: string | undefined, b: string | undefined): boolean {
  return (a ?? '') !== (b ?? '')
}

const inputBase =
  'w-full bg-surface-low border border-ghost rounded-md px-3 py-1.5 text-sm text-on-surface placeholder:text-outline'

function fieldClass(dirty: boolean, extra = ''): string {
  return [inputBase, dirty ? 'border-l-2 border-amber-500' : '', extra]
    .filter(Boolean)
    .join(' ')
}

// ── Section disclosure shell ─────────────────────────────────

interface SectionProps {
  id: string
  title: string
  meta?: string
  defaultOpen?: boolean
  children: ReactNode
}

function Section({ id, title, meta, defaultOpen = false, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section data-testid={`editrail-section-${id}`} className="border-b border-ghost">
      <button
        type="button"
        data-testid={`editrail-section-toggle-${id}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-surface-low transition-colors"
      >
        <span className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant">
          {title}
          {meta ? <span className="ml-2 text-outline normal-case">{meta}</span> : null}
        </span>
        <span className="text-on-surface-variant text-xs" aria-hidden="true">
          {open ? '−' : '+'}
        </span>
      </button>
      {open ? (
        <div
          data-testid={`editrail-section-body-${id}`}
          className="pl-3 ml-4 mr-4 mb-3 border-l border-ghost space-y-3"
        >
          <div className="pl-3">{children}</div>
        </div>
      ) : null}
    </section>
  )
}

function Label({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant block mb-1"
    >
      {children}
    </label>
  )
}

// ── Local-state text field with commit-on-blur ───────────────

interface TextFieldProps {
  id: string
  field: TextField
  label: string
  type?: string
  placeholder?: string
  maxLength?: number
  multiline?: boolean
  rows?: number
}

function ProfileTextField({
  id,
  field,
  label,
  type = 'text',
  placeholder,
  maxLength,
  multiline = false,
  rows = 3,
}: TextFieldProps) {
  const { state, dispatch } = usePortfolioStore()
  const storeValue = (state.profile[field] as string | undefined) ?? ''
  const published =
    (state.publishState?.targets['heyi.am']?.lastPublishedProfile[field] as
      | string
      | undefined) ?? undefined

  // Latest profile snapshot — read via ref inside the debounced save so the
  // save always projects over the freshest store state, not the state at
  // the time the timer was scheduled.
  const profileRef = useRef(state.profile)
  useEffect(() => {
    profileRef.current = state.profile
  }, [state.profile])

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cancel any pending save on unmount so a stale write doesn't land after
  // the component is gone.
  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
    }
  }, [])

  const dirty = valuesDiffer(storeValue, published)

  /**
   * Every keystroke:
   *  1. Dispatch to the store immediately (cheap, unblocks iframe reload).
   *  2. Re-schedule the debounced backend save.
   *
   * The store dispatch is NOT debounced — PreviewPane keys off store profile
   * changes and has its own 300ms debounce for the iframe reload, so the two
   * debounces naturally line up.
   */
  function handleChange(nextRaw: string) {
    const nextValue = nextRaw === '' ? undefined : nextRaw
    dispatch({ type: 'UPDATE_PROFILE_FIELD', field, value: nextValue })

    if (saveTimerRef.current !== null) {
      clearTimeout(saveTimerRef.current)
    }
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      const nextProfile: PortfolioProfile = {
        ...profileRef.current,
        [field]: nextValue,
      }
      void savePortfolio(nextProfile)
        .then(() => {
          // Only bump PreviewPane's iframe reload key after the backend has
          // actually accepted the write. On failure we deliberately leave
          // lastSavedAt untouched — the server HTML is unchanged, so the
          // iframe should not reload.
          dispatch({ type: 'PROFILE_SAVED' })
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error('[EditRail] Failed to persist profile field', field, err)
        })
    }, PROFILE_SAVE_DEBOUNCE_MS)
  }

  if (multiline) {
    return (
      <div>
        <Label htmlFor={id}>{label}</Label>
        <textarea
          id={id}
          data-testid={`editrail-field-${field}`}
          value={storeValue}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          rows={rows}
          className={fieldClass(dirty, 'resize-y')}
        />
      </div>
    )
  }

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <input
        id={id}
        type={type}
        data-testid={`editrail-field-${field}`}
        value={storeValue}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className={fieldClass(dirty)}
      />
    </div>
  )
}

// ── Photo + resume uploaders (handlers copied from Settings.tsx) ──

function PhotoField() {
  const { state, dispatch } = usePortfolioStore()
  const photo = state.profile.photoBase64
  const published = state.publishState?.targets['heyi.am']?.lastPublishedProfile.photoBase64
  const dirty = valuesDiffer(photo, published)

  // Read latest profile inside async callbacks so we don't save a stale
  // snapshot from the moment the FileReader started reading.
  const profileRef = useRef(state.profile)
  useEffect(() => {
    profileRef.current = state.profile
  }, [state.profile])

  // Photo uploads are intentional one-shot actions (not keystroke spam), so
  // we persist immediately rather than going through the debounced save path
  // used by ProfileTextField. Without this, a user who uploads a photo and
  // closes the tab without touching a text field would lose the photo.
  function persistProfile(next: PortfolioProfile) {
    void savePortfolio(next)
      .then(() => {
        dispatch({ type: 'PROFILE_SAVED' })
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[EditRail] Failed to persist photo', err)
      })
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > PHOTO_MAX_BYTES) {
      // eslint-disable-next-line no-alert
      alert('Photo must be under 5MB')
      e.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const nextValue = reader.result as string
      dispatch({
        type: 'UPDATE_PROFILE_FIELD',
        field: 'photoBase64',
        value: nextValue,
      })
      persistProfile({ ...profileRef.current, photoBase64: nextValue })
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function handleRemove() {
    dispatch({ type: 'UPDATE_PROFILE_FIELD', field: 'photoBase64', value: undefined })
    persistProfile({ ...profileRef.current, photoBase64: undefined })
  }

  return (
    <div>
      <Label>Profile photo</Label>
      <div
        className={
          dirty ? 'border-l-2 border-amber-500 pl-2 flex items-center gap-3' : 'flex items-center gap-3'
        }
      >
        {photo ? (
          <div className="relative w-14 h-14 rounded-full overflow-hidden border border-ghost shrink-0">
            <img src={photo} alt="Profile" className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="w-14 h-14 rounded-full bg-surface-low border border-ghost shrink-0 flex items-center justify-center">
            <span className="text-on-surface-variant text-[10px]">No photo</span>
          </div>
        )}
        <label className="text-xs font-mono text-primary hover:underline cursor-pointer">
          {photo ? 'Change photo' : 'Upload photo'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            data-testid="editrail-field-photoBase64"
            onChange={handleChange}
          />
        </label>
        {photo ? (
          <button
            type="button"
            onClick={handleRemove}
            className="text-xs text-on-surface-variant hover:text-on-surface transition-colors"
          >
            Remove
          </button>
        ) : null}
      </div>
    </div>
  )
}

function ResumeField() {
  const { state, dispatch } = usePortfolioStore()
  const resume = state.profile.resumeBase64
  const filename = state.profile.resumeFilename
  const published = state.publishState?.targets['heyi.am']?.lastPublishedProfile.resumeBase64
  const dirty = valuesDiffer(resume, published)

  const profileRef = useRef(state.profile)
  useEffect(() => {
    profileRef.current = state.profile
  }, [state.profile])

  // Same rationale as PhotoField.persistProfile: resume uploads are
  // intentional, so skip the debounce and persist immediately.
  function persistProfile(next: PortfolioProfile) {
    void savePortfolio(next)
      .then(() => {
        dispatch({ type: 'PROFILE_SAVED' })
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[EditRail] Failed to persist resume', err)
      })
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > RESUME_MAX_BYTES) {
      // eslint-disable-next-line no-alert
      alert('Resume must be under 10MB')
      e.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const nextValue = reader.result as string
      dispatch({
        type: 'UPDATE_PROFILE_FIELD',
        field: 'resumeBase64',
        value: nextValue,
      })
      dispatch({
        type: 'UPDATE_PROFILE_FIELD',
        field: 'resumeFilename',
        value: file.name,
      })
      persistProfile({
        ...profileRef.current,
        resumeBase64: nextValue,
        resumeFilename: file.name,
      })
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function handleRemove() {
    dispatch({ type: 'UPDATE_PROFILE_FIELD', field: 'resumeBase64', value: undefined })
    dispatch({ type: 'UPDATE_PROFILE_FIELD', field: 'resumeFilename', value: undefined })
    persistProfile({
      ...profileRef.current,
      resumeBase64: undefined,
      resumeFilename: undefined,
    })
  }

  return (
    <div>
      <Label>Resume (PDF)</Label>
      <div
        className={
          dirty ? 'border-l-2 border-amber-500 pl-2 flex items-center gap-3' : 'flex items-center gap-3'
        }
      >
        {resume ? (
          <span className="font-mono text-xs text-on-surface truncate max-w-[180px]">
            {filename ?? 'resume.pdf'}
          </span>
        ) : (
          <span className="text-xs text-on-surface-variant">No resume</span>
        )}
        <label className="text-xs font-mono text-primary hover:underline cursor-pointer">
          {resume ? 'Replace' : 'Upload PDF'}
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            data-testid="editrail-field-resumeBase64"
            onChange={handleChange}
          />
        </label>
        {resume ? (
          <button
            type="button"
            onClick={handleRemove}
            className="text-xs text-on-surface-variant hover:text-on-surface transition-colors"
          >
            Remove
          </button>
        ) : null}
      </div>
    </div>
  )
}

// ── Projects section (sortable) ──────────────────────────────

interface SortableRowProps {
  projectId: string
  title: string
  included: boolean
  onToggle: (projectId: string) => void
}

function SortableProjectRow({ projectId, title, included, onToggle }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: projectId,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`editrail-project-row-${projectId}`}
      className="group flex items-center gap-2 py-1.5 px-1 hover:bg-surface-low rounded-sm"
    >
      <button
        type="button"
        aria-label={`Drag ${title}`}
        data-testid={`editrail-project-handle-${projectId}`}
        className="opacity-0 group-hover:opacity-100 transition-opacity cursor-grab text-on-surface-variant text-xs font-mono px-1"
        {...attributes}
        {...listeners}
      >
        ::
      </button>
      <input
        type="checkbox"
        checked={included}
        data-testid={`editrail-project-checkbox-${projectId}`}
        onChange={() => onToggle(projectId)}
        className="shrink-0"
      />
      <span
        className={`text-sm truncate ${included ? 'text-on-surface' : 'text-on-surface-variant'}`}
      >
        {title}
      </span>
    </div>
  )
}

// Project toggle/reorder persistence:
//  - Every change dispatches to the local store immediately (cheap, drives
//    the section header count and drag preview).
//  - A 300ms debounced savePortfolio() call ships the WHOLE profile +
//    projectsOnPortfolio array to the backend (full-replace pattern: the
//    POST route stores exactly what we send, so partial saves would clobber
//    other fields).
//  - On successful save, dispatches BUMP_REFRESH so PreviewPane's iframe
//    re-mounts and re-fetches /preview/portfolio with the new filter
//    applied. (Live patching can't reach the projects grid — it'd require
//    rebuilding the list from scratch.)
function ProjectsSection() {
  const { state, dispatch } = usePortfolioStore()
  const [projectMeta, setProjectMeta] = useState<Record<string, string>>({})

  // Always read the freshest profile + projects via refs inside the
  // debounced callback so we project over the latest state, not the
  // snapshot at the time the timer was scheduled.
  const profileRef = useRef(state.profile)
  const projectsRef = useRef(state.projects)
  useEffect(() => {
    profileRef.current = state.profile
  }, [state.profile])
  useEffect(() => {
    projectsRef.current = state.projects
  }, [state.projects])

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
    }
  }, [])

  function scheduleProjectsSave() {
    if (saveTimerRef.current !== null) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      const payload: PortfolioProfile = {
        ...profileRef.current,
        projectsOnPortfolio: projectsRef.current
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((p, i) => ({ projectId: p.projectId, included: p.included, order: i })),
      }
      void savePortfolio(payload)
        .then(() => {
          dispatch({ type: 'BUMP_REFRESH' })
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error('[EditRail] Failed to persist projectsOnPortfolio', err)
        })
    }, PROFILE_SAVE_DEBOUNCE_MS)
  }

  useEffect(() => {
    let cancelled = false
    fetchProjects()
      .then((projects: Project[]) => {
        if (cancelled) return
        const map: Record<string, string> = {}
        for (const p of projects) {
          map[p.dirName] = p.name
        }
        setProjectMeta(map)
      })
      .catch(() => {
        // Non-fatal: titles fall back to projectId.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const sorted = useMemo(
    () => state.projects.slice().sort((a, b) => a.order - b.order),
    [state.projects],
  )
  const includedCount = sorted.filter((p) => p.included).length
  const meta = `${includedCount} of ${sorted.length}`

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ids = sorted.map((p) => p.projectId)
    const oldIndex = ids.indexOf(String(active.id))
    const newIndex = ids.indexOf(String(over.id))
    if (oldIndex < 0 || newIndex < 0) return
    // arrayMove is the canonical helper here; we still call REORDER_PROJECT
    // to keep the store as the source of truth.
    void arrayMove
    dispatch({ type: 'REORDER_PROJECT', projectId: String(active.id), newIndex })
    scheduleProjectsSave()
  }

  function handleToggle(projectId: string) {
    dispatch({ type: 'TOGGLE_PROJECT_INCLUDED', projectId })
    scheduleProjectsSave()
  }

  return (
    <Section id="projects" title="Projects on portfolio" meta={`· ${meta}`}>
      {sorted.length === 0 ? (
        <p className="text-xs text-on-surface-variant">No projects yet.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={sorted.map((p) => p.projectId)}
            strategy={verticalListSortingStrategy}
          >
            <div data-testid="editrail-projects-list">
              {sorted.map((p) => (
                <SortableProjectRow
                  key={p.projectId}
                  projectId={p.projectId}
                  title={projectMeta[p.projectId] ?? p.projectId}
                  included={p.included}
                  onToggle={handleToggle}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </Section>
  )
}

// ── Template + Accent stub sections ──────────────────────────

function TemplateSection() {
  const [name, setName] = useState<string>('editorial')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchTheme()
      .then((t) => {
        if (!cancelled) setName(t.template)
      })
      .catch(() => {
        // keep default
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Mirrors PreviewPane.handleSelectTemplate: optimistic update, persist via
  // saveTheme, roll back on failure. Modal close happens unconditionally so
  // the user is never trapped in a stuck dialog. Errors are swallowed at the
  // UI layer for now — a future polish pass can route them through StatusBar.
  const handleSelectTemplate = async (newTemplate: string) => {
    setOpen(false)
    const previous = name
    setName(newTemplate)
    try {
      await saveTheme(newTemplate)
    } catch {
      setName(previous)
    }
  }

  return (
    <Section id="template" title="Template">
      <div className="flex items-center gap-3">
        <span
          data-testid="editrail-template-pill"
          className="font-mono text-xs px-2 py-1 rounded-sm bg-surface-low border border-ghost text-on-surface"
        >
          {name}
        </span>
        <button
          type="button"
          data-testid="editrail-template-change"
          className="text-xs font-mono text-primary hover:underline"
          onClick={() => setOpen(true)}
        >
          Change template
        </button>
      </div>
      {open && (
        <TemplateBrowser
          mode="modal"
          onClose={() => setOpen(false)}
          onSelectTemplate={handleSelectTemplate}
        />
      )}
    </Section>
  )
}

// AccentSection removed by user request — the picker UI is gone, but the
// `accent` field on PortfolioProfile is intentionally retained as reserved
// state. portfolio-render-data.ts still reads `profile.accent || #084471`
// so any user with a previously persisted accent keeps it; new users get
// the default. A future custom-accent feature can re-introduce a UI.

// ── Top-level EditRail ───────────────────────────────────────

export function EditRail() {
  return (
    <aside
      data-testid="portfolio-editrail"
      className="w-[360px] shrink-0 border-l border-ghost bg-surface-lowest overflow-y-auto"
    >
      <Section id="identity" title="Identity" defaultOpen>
        <ProfileTextField
          id="editrail-displayName"
          field="displayName"
          label="Display name"
          placeholder="Jane Smith"
          maxLength={200}
        />
        <ProfileTextField
          id="editrail-bio"
          field="bio"
          label="Bio / About"
          placeholder="A short bio for your portfolio..."
          maxLength={2000}
          multiline
          rows={3}
        />
        <ProfileTextField
          id="editrail-location"
          field="location"
          label="Location"
          placeholder="San Francisco, CA"
        />
      </Section>

      <Section id="contact" title="Contact">
        <ProfileTextField
          id="editrail-email"
          field="email"
          label="Email"
          type="email"
          placeholder="jane@example.com"
        />
        <ProfileTextField
          id="editrail-phone"
          field="phone"
          label="Phone"
          type="tel"
          placeholder="+1 (555) 123-4567"
        />
        <ProfileTextField
          id="editrail-linkedin"
          field="linkedinUrl"
          label="LinkedIn URL"
          type="url"
          placeholder="https://linkedin.com/in/janesmith"
        />
        <ProfileTextField
          id="editrail-github"
          field="githubUrl"
          label="GitHub URL"
          type="url"
          placeholder="https://github.com/janesmith"
        />
        <ProfileTextField
          id="editrail-twitter"
          field="twitterHandle"
          label="Twitter / X"
          placeholder="@janesmith"
        />
        <ProfileTextField
          id="editrail-website"
          field="websiteUrl"
          label="Personal website"
          type="url"
          placeholder="https://janesmith.dev"
        />
      </Section>

      <Section id="photo-resume" title="Photo & resume">
        <PhotoField />
        <ResumeField />
      </Section>

      <ProjectsSection />

      <TemplateSection />
    </aside>
  )
}
