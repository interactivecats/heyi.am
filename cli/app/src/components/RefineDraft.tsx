import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { saveProjectLocally } from '../api'
import { useRefine } from '../contexts/ProjectRefineContext'
import { AppShell, Card, SectionHeader } from './shared'
import { PhaseDots } from './PhaseDots'

const structureItems = [
  'One-line summary',
  'Narrative',
  'Key decisions',
  'Turning points',
  'What shipped',
  'Human vs AI',
]

export function RefineDraft() {
  const { dirName } = useParams<{ dirName: string }>()
  const navigate = useNavigate()
  const refine = useRefine()
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!dirName) return
    setSaving(true)
    try {
      await saveProjectLocally(dirName)
      navigate(`/project/${encodeURIComponent(dirName)}/output`)
    } catch {
      // stay on page
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppShell
      back={{ label: 'Questions', to: `/project/${encodeURIComponent(dirName ?? '')}/refine/questions` }}
      chips={[{ label: 'Refine project · step 4 of 4' }]}
      actions={
        <>
          <button
            onClick={handleSave}
            disabled={saving}
            className="font-semibold text-[0.8125rem] px-3.5 py-1.5 rounded-sm bg-primary text-on-primary hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save locally'}
          </button>
          <Link
            to={`/project/${encodeURIComponent(dirName ?? '')}/publish`}
            className="font-semibold text-[0.8125rem] px-3.5 py-1.5 rounded-sm border border-ghost text-primary hover:border-outline transition-colors"
          >
            Publish public version
          </Link>
        </>
      }
    >
      <div className="p-6">
        <PhaseDots current={4} />

        <div className="grid grid-cols-2 gap-4">
          {/* Structure sidebar */}
          <Card>
            <SectionHeader title="Structure" meta="document map" />
            <div className="flex flex-col gap-0.5">
              {structureItems.map((item, i) => (
                <div
                  key={item}
                  className={`px-2.5 py-2 rounded-sm text-[0.8125rem] cursor-pointer transition-colors ${
                    i === 0
                      ? 'bg-primary/[0.06] text-primary font-semibold'
                      : 'text-on-surface-variant hover:bg-primary/[0.04] hover:text-primary'
                  }`}
                >
                  {item}
                </div>
              ))}
            </div>
          </Card>

          {/* Editable draft */}
          <Card>
            <SectionHeader title="Draft review" meta="editable" />
            <textarea
              value={refine.draftNarrative}
              onChange={(e) => refine.setDraft(e.target.value, refine.draftTimeline ?? [])}
              className="w-full min-h-[300px] resize-y rounded-md bg-surface-lowest border border-ghost p-4 leading-relaxed text-sm text-on-surface font-body focus:outline-2 focus:outline-primary/15"
              placeholder="Start writing your project narrative..."
            />
            <div className="h-3" />
            <div className="flex items-center gap-1">
              {['Shorten', 'More technical', 'More understated', 'Remove overclaiming'].map((label) => (
                <button
                  key={label}
                  className="text-xs px-2.5 py-1 rounded-sm border border-ghost text-primary hover:border-outline transition-colors"
                >
                  {label}
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  )
}
