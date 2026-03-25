import { Link, useParams } from 'react-router-dom'
import { useRefine } from '../contexts/ProjectRefineContext'
import { AppShell, Card } from './shared'
import { PhaseDots } from './PhaseDots'

export function RefineQuestions() {
  const { dirName } = useParams<{ dirName: string }>()
  const refine = useRefine()

  const questions = refine.enhanceResult?.questions ?? [
    {
      id: 'q1',
      category: 'architecture' as const,
      question: 'What risk were you trying to eliminate by moving rendering to the CLI?',
      context: 'Architecture shift',
    },
    {
      id: 'q2',
      category: 'evolution' as const,
      question: 'What made the original auth path not worth patching?',
      context: 'Project reset',
    },
  ]

  function handleAnswerChange(questionId: string, question: string, answer: string) {
    const existing = refine.answers.filter((a) => a.questionId !== questionId)
    refine.setAnswers([...existing, { questionId, question, answer }])
  }

  return (
    <AppShell
      back={{ label: 'Moments', to: `/project/${encodeURIComponent(dirName ?? '')}/refine/moments` }}
      chips={[{ label: 'Refine project · step 3 of 4' }]}
    >
      <div className="p-6 max-w-[960px]">
        <PhaseDots current={3} />

        <h2 className="font-display text-xl font-bold text-on-surface">A few grounded questions</h2>
        <p className="text-on-surface-variant text-sm mt-1">
          These sharpen voice and judgment without turning the product into a personality test.
        </p>

        <div className="h-4" />

        <div className="flex flex-col gap-3">
          {questions.map((q) => {
            const answer = refine.answers.find((a) => a.questionId === q.id)?.answer ?? ''
            return (
              <Card key={q.id}>
                <div className="font-mono text-[9px] uppercase tracking-wider text-primary mb-2">
                  {q.context ?? q.category}
                </div>
                <h3 className="font-display text-[0.9375rem] font-semibold text-on-surface">{q.question}</h3>
                <div className="h-3" />
                <textarea
                  value={answer}
                  onChange={(e) => handleAnswerChange(q.id, q.question, e.target.value)}
                  className="w-full min-h-[80px] resize-y rounded-sm border border-ghost bg-surface-lowest px-3 py-2.5 font-body text-[0.8125rem] text-on-surface leading-relaxed focus:outline-2 focus:outline-primary/15"
                  placeholder="Your answer..."
                />
              </Card>
            )
          })}
        </div>

        <div className="h-5" />

        <div className="flex items-center gap-2">
          <Link
            to={`/project/${encodeURIComponent(dirName ?? '')}/refine/draft`}
            className="inline-flex items-center gap-1.5 font-semibold text-[0.8125rem] px-3.5 py-1.5 rounded-sm bg-primary text-on-primary hover:bg-primary-hover transition-colors"
          >
            Weave into draft &rarr;
          </Link>
          <Link
            to={`/project/${encodeURIComponent(dirName ?? '')}/refine/draft`}
            className="text-xs text-on-surface-variant hover:text-on-surface transition-colors"
          >
            Skip questions
          </Link>
        </div>
      </div>
    </AppShell>
  )
}
