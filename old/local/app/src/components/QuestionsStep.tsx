import { useState, useEffect } from "react";
import type { SessionQuestion, QuestionAnswer } from "../types";
import CharCounter from "./CharCounter";

const ANSWER_MAX = 200;

interface Props {
  questions: SessionQuestion[];
  onComplete: (answers: QuestionAnswer[]) => void;
  onSkip: () => void;
}

/**
 * Shows all session questions at once with editable textareas
 * pre-filled with AI-suggested answers. Accepting suggestions
 * as-is is fine — the dev's value is confirming accuracy.
 */
export default function QuestionsStep({ questions, onComplete, onSkip }: Props) {
  // Guard: if no questions, skip immediately
  useEffect(() => {
    if (questions.length === 0) onSkip();
  }, [questions.length, onSkip]);

  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const q of questions) {
      initial[q.id] = q.suggestedAnswer;
    }
    return initial;
  });

  function updateAnswer(id: string, value: string) {
    setAnswers((prev) => ({ ...prev, [id]: value.slice(0, ANSWER_MAX) }));
  }

  function handleContinue() {
    const questionAnswers: QuestionAnswer[] = questions
      .map((q) => ({
        questionId: q.id,
        answer: (answers[q.id] || "").trim(),
      }))
      .filter((a) => a.answer.length > 0);

    onComplete(questionAnswers);
  }

  // At least one non-empty answer
  const hasAnyAnswer = questions.some((q) => (answers[q.id] || "").trim().length > 0);

  return (
    <div className="se-questions">
      <div className="se-questions__header">
        <h2 className="se-questions__title">Before we enhance</h2>
        <p className="se-questions__desc">
          Without your input, the case study is 95% AI voice. These answers get
          woven directly into the output so it reads like your build log, not
          a generated summary. Accept, edit, or clear any answer.
        </p>
      </div>

      <div className="se-questions__list">
        {questions.map((q) => (
          <div className="se-question-card" key={q.id}>
            {q.context && (
              <div className="se-question-card__context">{q.context}</div>
            )}
            <div className="se-question-card__text">{q.question}</div>
            <textarea
              className="se-question-card__input"
              value={answers[q.id] || ""}
              onChange={(e) => updateAnswer(q.id, e.target.value)}
              maxLength={ANSWER_MAX}
              rows={2}
              placeholder="Your answer..."
            />
            <CharCounter
              current={(answers[q.id] || "").length}
              max={ANSWER_MAX}
            />
          </div>
        ))}
      </div>

      <div className="se-questions__footer">
        <button
          type="button"
          className="se-questions__continue"
          onClick={handleContinue}
          disabled={!hasAnyAnswer}
        >
          Continue
        </button>
        <button
          type="button"
          className="se-questions__skip"
          onClick={onSkip}
        >
          Skip
        </button>
      </div>
    </div>
  );
}
