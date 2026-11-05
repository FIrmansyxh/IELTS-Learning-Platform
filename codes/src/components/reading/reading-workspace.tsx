'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, CloudOff, Copy, Flag, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ExamShell } from '@/components/quiz/exam-shell';
import { QuestionNavigatorGrid } from '@/components/quiz/question-navigator-grid';
import { QuestionRenderer } from '@/components/quiz/question-renderer';
import { coerceStored, initialResponse, isAiQuestion, isAnswerReady } from '@/components/quiz/answer-utils';
import type { AnswerResponse, Attempt } from '@/contracts/attempts';
import { fmt, id } from '@/i18n/id';
import { attemptsApi } from '@/lib/api/attempts';
import { isApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/errors';
import { parsePassages, type Passage } from '@/lib/reading/parsePassages';
import { PassageView } from './passage-view';
import {
  type Highlight,
  loadFlags,
  loadHighlights,
  loadSplitRatio,
  saveFlags,
  saveHighlights,
  saveSplitRatio,
} from './highlight-utils';

const SAVE_DEBOUNCE_MS = 400;
const AUTO_RETRY_MS = 3000;
const SUBMIT_FAIL_TOAST = 'exam-submit-failed';

export interface ReadingWorkspaceProps {
  attempt: Attempt;
  onSectionSubmit?: () => Promise<void>;
  submitLabel?: string;
}

export function ReadingWorkspace({ attempt, onSectionSubmit, submitLabel }: ReadingWorkspaceProps) {
  const router = useRouter();
  const questions = attempt.questions;
  const total = questions.length;

  // Split panel ratio (35 - 65, default 50)
  const [ratio, setRatio] = React.useState<number>(() => loadSplitRatio());
  const [isDragging, setIsDragging] = React.useState(false);

  // Parse passages
  const parseResult = React.useMemo(() => {
    try {
      const p = parsePassages(attempt.passage_markdown ?? '');
      return { passages: p, error: null };
    } catch (e) {
      return { passages: [], error: e instanceof Error ? e.message : 'parse_error' };
    }
  }, [attempt.passage_markdown]);

  const passages = parseResult.passages;
  const [activePassageIndex, setActivePassageIndex] = React.useState(0);
  const activePassage: Passage | undefined = passages[activePassageIndex] ?? passages[0];

  // Mobile tab state
  const [mobileTab, setMobileTab] = React.useState<'text' | 'questions'>('text');
  const textScrollPos = React.useRef(0);
  const questionsScrollPos = React.useRef(0);
  const textPanelRef = React.useRef<HTMLDivElement | null>(null);
  const questionsPanelRef = React.useRef<HTMLDivElement | null>(null);

  // Highlights state
  const [highlights, setHighlights] = React.useState<Highlight[]>(() => loadHighlights(attempt.id));
  React.useEffect(() => {
    saveHighlights(attempt.id, highlights);
  }, [attempt.id, highlights]);

  // Flags state
  const [flagged, setFlagged] = React.useState<Set<string>>(() => new Set(loadFlags(attempt.id)));
  React.useEffect(() => {
    saveFlags(attempt.id, [...flagged]);
  }, [attempt.id, flagged]);

  // Questions grouped by passage_no (1-based, null -> 1)
  const questionsForActivePassage = React.useMemo(() => {
    if (!activePassage) return questions;
    const currentPassageNo = activePassage.passage_no;
    return questions.filter((q) => {
      const pNo = q.passage_no ?? 1;
      if (pNo > passages.length) {
        console.warn(`Question ${q.question_id} has invalid passage_no ${pNo}`);
        return currentPassageNo === 1;
      }
      return pNo === currentPassageNo;
    });
  }, [questions, activePassage, passages.length]);

  // Current global question index
  const [currentIndex, setCurrentIndex] = React.useState(() =>
    Math.min(attempt.current_index, Math.max(0, total - 1)),
  );
  const currentQ = questions[currentIndex];

  const switchPassage = React.useCallback(
    (idx: number) => {
      setActivePassageIndex(idx);
      const targetPassageNo = passages[idx]?.passage_no;
      if (targetPassageNo !== undefined) {
        const firstQIdx = questions.findIndex((q) => (q.passage_no ?? 1) === targetPassageNo);
        if (firstQIdx !== -1) {
          setCurrentIndex(firstQIdx);
        }
      }
    },
    [passages, questions],
  );

  // If current question changes and belongs to another passage, sync active passage
  React.useEffect(() => {
    if (!currentQ) return;
    const pNo = currentQ.passage_no ?? 1;
    const targetIdx = passages.findIndex((p) => p.passage_no === pNo);
    if (targetIdx !== -1) {
      setActivePassageIndex((prev) => (prev !== targetIdx ? targetIdx : prev));
    }
  }, [currentIndex, currentQ, passages]);

  // Answers & saving state
  const [responses, setResponses] = React.useState<Record<string, AnswerResponse | null>>(() => {
    const m: Record<string, AnswerResponse | null> = {};
    for (const q of questions) m[q.question_id] = initialResponse(q);
    for (const a of attempt.answers) m[a.question_id] = coerceStored(a.response);
    return m;
  });
  const [saved, setSaved] = React.useState<Set<string>>(() => new Set(attempt.answers.map((a) => a.question_id)));
  const [failedSaves, setFailedSaves] = React.useState<Set<string>>(new Set());
  const [saveState, setSaveState] = React.useState<'idle' | 'saving' | 'saved'>('idle');
  const [submitting, setSubmitting] = React.useState(false);

  const timers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const latest = React.useRef(responses);
  latest.current = responses;
  const failedSavesRef = React.useRef(failedSaves);
  failedSavesRef.current = failedSaves;
  const submittingRef = React.useRef(false);
  const allowLeave = React.useRef(false);
  const nextAutoAt = React.useRef(0);

  // Timer based on server deadline
  const skew = React.useRef(Date.parse(attempt.server_now) - Date.now());
  const deadline = attempt.deadline_at ? Date.parse(attempt.deadline_at) : null;
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const remaining = deadline === null ? null : Math.max(0, Math.ceil((deadline - (now + skew.current)) / 1000));

  const goResult = React.useCallback(() => router.replace(`/ujian/${attempt.id}/hasil`), [router, attempt.id]);

  // Periodic drift correction sync every 60s
  React.useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const synced = await attemptsApi.get(attempt.id);
        if (synced.server_now) {
          skew.current = Date.parse(synced.server_now) - Date.now();
        }
      } catch {
        // Ignore background sync errors
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [attempt.id]);

  const saveNow = React.useCallback(
    async (qid: string, retries = 3): Promise<'ok' | 'failed' | 'ended'> => {
      const resp = latest.current[qid];
      const q = questions.find((x) => x.question_id === qid);
      if (!resp || !q || !isAnswerReady(q, resp)) return 'ok';
      setSaveState('saving');

      const attemptSave = async (attemptNo: number): Promise<'ok' | 'failed' | 'ended'> => {
        try {
          await attemptsApi.answer(attempt.id, qid, resp);
          setFailedSaves((prev) => {
            const next = new Set(prev);
            next.delete(qid);
            return next;
          });
          setSaved((s) => new Set(s).add(qid));
          setSaveState('saved');
          return 'ok';
        } catch (e) {
          if (isApiError(e) && (e.code === 'ATTEMPT_EXPIRED' || e.code === 'ATTEMPT_NOT_ACTIVE')) {
            allowLeave.current = true;
            goResult();
            return 'ended';
          }
          if (attemptNo < retries) {
            const delay = Math.pow(2, attemptNo) * 1000;
            await new Promise((res) => setTimeout(res, delay));
            return attemptSave(attemptNo + 1);
          }
          setSaveState('idle');
          setFailedSaves((prev) => new Set(prev).add(qid));
          toast.error(id.quiz.answerNotSaved, {
            duration: Infinity,
            action: { label: id.common.retry, onClick: () => void saveNow(qid) },
          });
          return 'failed';
        }
      };

      return attemptSave(1);
    },
    [attempt.id, questions, goResult],
  );

  const flushPending = React.useCallback(async () => {
    const pending = new Set<string>([...timers.current.keys(), ...failedSavesRef.current]);
    for (const qid of timers.current.keys()) {
      clearTimeout(timers.current.get(qid));
      timers.current.delete(qid);
    }
    const results = await Promise.all([...pending].map((qid) => saveNow(qid)));
    if (results.includes('ended')) return 'ended';
    return results.includes('failed') ? 'failed' : 'ok';
  }, [saveNow]);

  const finish = React.useCallback(async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    const flushed = await flushPending();
    if (flushed === 'ended') return;
    if (flushed === 'failed') {
      nextAutoAt.current = Date.now() + AUTO_RETRY_MS;
      submittingRef.current = false;
      setSubmitting(false);
      toast.error(id.exam.run.saveFailedBeforeSubmit, { id: SUBMIT_FAIL_TOAST });
      return;
    }
    try {
      if (onSectionSubmit) {
        await onSectionSubmit();
        toast.dismiss(SUBMIT_FAIL_TOAST);
        allowLeave.current = true;
        return;
      }
      await attemptsApi.submit(attempt.id);
      toast.dismiss(SUBMIT_FAIL_TOAST);
      allowLeave.current = true;
      goResult();
    } catch (e) {
      if (isApiError(e) && (e.code === 'ATTEMPT_EXPIRED' || e.code === 'ATTEMPT_NOT_ACTIVE')) {
        allowLeave.current = true;
        goResult();
        return;
      }
      nextAutoAt.current = Date.now() + AUTO_RETRY_MS;
      submittingRef.current = false;
      setSubmitting(false);
      toast.error(apiErrorMessage(e), { id: SUBMIT_FAIL_TOAST });
    }
  }, [flushPending, attempt.id, goResult, onSectionSubmit]);

  // BeforeUnload protection
  React.useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (allowLeave.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // Auto-submit when time expires
  React.useEffect(() => {
    if (remaining === 0 && !submittingRef.current && Date.now() >= nextAutoAt.current) {
      void finish();
    }
  }, [remaining, now, finish]);

  // Clean up timers
  React.useEffect(() => {
    const map = timers.current;
    return () => {
      for (const t of map.values()) clearTimeout(t);
    };
  }, []);

  // Answer change handler
  const onAnswerChange = (next: AnswerResponse | null) => {
    if (!currentQ) return;
    const qid = currentQ.question_id;
    setResponses((m) => ({ ...m, [qid]: next }));
    latest.current = { ...latest.current, [qid]: next };

    const old = timers.current.get(qid);
    if (old) clearTimeout(old);
    timers.current.set(
      qid,
      setTimeout(() => {
        timers.current.delete(qid);
        void saveNow(qid);
      }, SAVE_DEBOUNCE_MS),
    );
  };

  const goToQuestion = async (targetIndex: number) => {
    if (currentQ) {
      const t = timers.current.get(currentQ.question_id);
      if (t) {
        clearTimeout(t);
        timers.current.delete(currentQ.question_id);
        void saveNow(currentQ.question_id);
      }
    }
    setCurrentIndex(Math.max(0, Math.min(total - 1, targetIndex)));
  };

  // Keyboard navigation Alt+ArrowLeft / Alt+ArrowRight
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        if (currentIndex < total - 1) void goToQuestion(currentIndex + 1);
      } else if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        if (currentIndex > 0) void goToQuestion(currentIndex - 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  // Separator keyboard and drag handling
  const handleSeparatorKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setRatio((r) => {
        const next = Math.min(65, r + 5);
        saveSplitRatio(next);
        return next;
      });
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setRatio((r) => {
        const next = Math.max(35, r - 5);
        saveSplitRatio(next);
        return next;
      });
    }
  };

  const workspaceRef = React.useRef<HTMLDivElement | null>(null);

  const startDragging = React.useCallback(() => {
    setIsDragging(true);
  }, []);

  React.useEffect(() => {
    if (!isDragging) return;

    const onMouseMove = (e: MouseEvent) => {
      if (!workspaceRef.current) return;
      const rect = workspaceRef.current.getBoundingClientRect();
      const currentX = e.clientX - rect.left;
      const pct = (currentX / rect.width) * 100;
      const clamped = Math.max(35, Math.min(65, Math.round(pct)));
      setRatio(clamped);
      saveSplitRatio(clamped);
    };

    const onMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDragging]);

  // Mobile tab scroll position preservation
  const switchMobileTab = (tab: 'text' | 'questions') => {
    if (tab === 'questions' && textPanelRef.current) {
      textScrollPos.current = textPanelRef.current.scrollTop;
    } else if (tab === 'text' && questionsPanelRef.current) {
      questionsScrollPos.current = questionsPanelRef.current.scrollTop;
    }

    setMobileTab(tab);

    setTimeout(() => {
      if (tab === 'text' && textPanelRef.current) {
        textPanelRef.current.scrollTop = textScrollPos.current;
      } else if (tab === 'questions' && questionsPanelRef.current) {
        questionsPanelRef.current.scrollTop = questionsScrollPos.current;
      }
    }, 20);
  };

  // Navigator items
  const isDone = (qid: string, qq: (typeof questions)[number]) =>
    !isAiQuestion(qq) && (saved.has(qid) || isAnswerReady(qq, responses[qid] ?? null));
  const navItems = questions.map((qq) => ({
    questionId: qq.question_id,
    answered: isDone(qq.question_id, qq),
    flagged: flagged.has(qq.question_id),
  }));
  const answeredCount = navItems.filter((i) => i.answered).length;

  // Header question range for active passage
  const activeQuestionsHeader = React.useMemo(() => {
    if (!activePassage || questionsForActivePassage.length === 0) return '';
    const firstQ = questionsForActivePassage[0]!;
    const lastQ = questionsForActivePassage[questionsForActivePassage.length - 1]!;
    const a = questions.indexOf(firstQ) + 1;
    const b = questions.indexOf(lastQ) + 1;
    return fmt(id.reading.passageHeader, { n: activePassage.passage_no, a, b });
  }, [activePassage, questionsForActivePassage, questions]);

  const isCurrentFlagged = currentQ ? flagged.has(currentQ.question_id) : false;

  return (
    <ExamShell
      title={attempt.title}
      remainingSeconds={remaining}
      unansweredCount={total - answeredCount}
      onEnd={() => void finish()}
      endLabel={submitLabel}
      navigator={
        <details className="rounded-lg border bg-card p-3 md:open:block">
          <summary className="min-h-11 cursor-pointer list-none text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {id.quiz.exam.openNavigator} · {fmt(id.exam.run.answeredCount, { n: answeredCount, total })}
          </summary>
          <div className="pt-3">
            <QuestionNavigatorGrid
              items={navItems}
              currentIndex={currentIndex}
              onSelect={(i) => {
                void goToQuestion(i);
                if (mobileTab === 'text') switchMobileTab('questions');
              }}
            />
          </div>
        </details>
      }
    >
      {/* Mobile Tab Switcher (<1024px) */}
      <div className="flex lg:hidden sticky top-0 z-30 mb-3 border-b bg-background" role="tablist">
        <button
          role="tab"
          aria-selected={mobileTab === 'text'}
          onClick={() => switchMobileTab('text')}
          className={`flex-1 py-3 text-sm font-semibold transition-colors border-b-2 ${
            mobileTab === 'text'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          {id.reading.tabText}
        </button>
        <button
          role="tab"
          aria-selected={mobileTab === 'questions'}
          onClick={() => switchMobileTab('questions')}
          className={`flex-1 py-3 text-sm font-semibold transition-colors border-b-2 ${
            mobileTab === 'questions'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          {id.reading.tabQuestions}
        </button>
      </div>

      {/* Main Workspace */}
      <div
        ref={workspaceRef}
        className="relative flex flex-col lg:flex-row w-full h-[calc(100dvh-130px)] select-none"
      >
        {/* Left Panel: Reading Passage */}
        <div
          ref={textPanelRef}
          style={{ width: `${ratio}%` }}
          className={`h-full overflow-y-auto px-4 sm:px-6 py-2 select-text ${
            mobileTab === 'text' ? 'block w-full lg:block' : 'hidden lg:block'
          }`}
        >
          {/* Segmented Passage Switcher (if > 1 passage) */}
          {passages.length > 1 && (
            <div className="mb-4 flex flex-wrap gap-1.5 rounded-lg border bg-surface-muted p-1">
              {passages.map((p, idx) => (
                <button
                  key={`p-tab-${p.passage_no}`}
                  onClick={() => switchPassage(idx)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    activePassageIndex === idx
                      ? 'bg-surface text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {fmt(id.reading.passageSegment, { n: p.passage_no })}
                </button>
              ))}
            </div>
          )}

          {/* Fallback card if passage parse failed */}
          {parseResult.error && (
            <Card className="p-6 text-center">
              <h3 className="text-lg font-bold text-destructive mb-2">
                {id.reading.errorPassageTitle}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Kode galat: {parseResult.error}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 mx-auto"
                onClick={() => {
                  navigator.clipboard.writeText(parseResult.error ?? '');
                  toast.success(id.reading.errorPassageCopied);
                }}
              >
                <Copy className="h-4 w-4" />
                {id.reading.errorPassageReport}
              </Button>
            </Card>
          )}

          {/* Active Passage View */}
          {activePassage && (
            <PassageView
              passage={activePassage}
              highlights={highlights}
              onAddHighlight={(hl) => setHighlights((prev) => [...prev, hl])}
              onRemoveHighlight={(idToRemove) =>
                setHighlights((prev) => prev.filter((h) => h.id !== idToRemove))
              }
              onClearPassageHighlights={(pNo) =>
                setHighlights((prev) => prev.filter((h) => h.passage_no !== pNo))
              }
            />
          )}

          {/* Mobile shortcut to jump to questions */}
          <div className="mt-8 pt-4 border-t lg:hidden">
            <Button
              className="w-full"
              variant="outline"
              onClick={() => switchMobileTab('questions')}
            >
              {id.reading.btnBackToQuestions}
            </Button>
          </div>
        </div>

        {/* Desktop Splitter Separator */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={id.reading.separatorAria}
          aria-valuemin={35}
          aria-valuemax={65}
          aria-valuenow={ratio}
          tabIndex={0}
          onKeyDown={handleSeparatorKeyDown}
          onMouseDown={startDragging}
          className="hidden lg:flex w-3 shrink-0 cursor-col-resize items-center justify-center bg-transparent hover:bg-border/50 transition-colors focus:bg-primary/20 outline-none"
        >
          <GripVertical className="h-5 w-5 text-muted-foreground" />
        </div>

        {/* Right Panel: Questions */}
        <div
          ref={questionsPanelRef}
          style={{ width: `${100 - ratio}%` }}
          className={`h-full overflow-y-auto px-4 sm:px-6 py-2 select-text ${
            mobileTab === 'questions' ? 'block w-full lg:block' : 'hidden lg:block'
          }`}
        >
          {/* Passage questions header banner */}
          {activeQuestionsHeader && (
            <div className="mb-4 flex items-center justify-between border-b pb-2">
              <span className="text-sm font-bold text-primary">
                {activeQuestionsHeader}
              </span>
              <Button
                variant="link"
                size="sm"
                className="lg:hidden text-xs text-muted-foreground"
                onClick={() => switchMobileTab('text')}
              >
                {id.reading.btnViewText}
              </Button>
            </div>
          )}

          {currentQ ? (
            <section
              className="grid gap-4"
              aria-label={fmt(id.exam.run.questionOf, { n: currentIndex + 1, total })}
            >
              <div className="flex items-center justify-between gap-3 text-sm">
                <p className="font-semibold" data-testid="question-counter">
                  {fmt(id.exam.run.questionOf, { n: currentIndex + 1, total })}
                </p>
                <div className="flex items-center gap-2">
                  {failedSaves.has(currentQ.question_id) && (
                    <span className="flex items-center gap-1 text-xs text-destructive">
                      <CloudOff className="h-3.5 w-3.5" />
                      {id.reading.unsavedWarning}
                    </span>
                  )}
                  <p role="status" aria-live="polite" className="text-muted-foreground">
                    {saveState === 'saving'
                      ? id.exam.run.saving
                      : saveState === 'saved'
                      ? id.exam.run.saved
                      : ''}
                  </p>
                </div>
              </div>

              {/* Question Renderer */}
              <div className="rounded-xl border bg-card p-4 sm:p-6">
                <QuestionRenderer
                  key={currentQ.question_id}
                  question={currentQ}
                  value={responses[currentQ.question_id] ?? null}
                  onChange={onAnswerChange}
                  disabled={submitting}
                  feedback={null}
                />
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  variant="outline"
                  onClick={() => void goToQuestion(currentIndex - 1)}
                  disabled={currentIndex === 0 || submitting}
                >
                  <ChevronLeft aria-hidden="true" />
                  {id.exam.run.prev}
                </Button>
                <Button
                  variant="ghost"
                  aria-pressed={isCurrentFlagged}
                  onClick={() =>
                    setFlagged((s) => {
                      const n = new Set(s);
                      if (n.has(currentQ.question_id)) n.delete(currentQ.question_id);
                      else n.add(currentQ.question_id);
                      return n;
                    })
                  }
                >
                  <Flag aria-hidden="true" className={isCurrentFlagged ? 'fill-current' : ''} />
                  {isCurrentFlagged ? id.exam.run.unflag : id.exam.run.flag}
                </Button>
                <Button
                  onClick={() => void goToQuestion(currentIndex + 1)}
                  disabled={currentIndex >= total - 1 || submitting}
                >
                  {id.exam.run.next}
                  <ChevronRight aria-hidden="true" />
                </Button>
              </div>
            </section>
          ) : (
            <p className="text-muted-foreground">{id.common.loading}</p>
          )}
        </div>
      </div>
    </ExamShell>
  );
}
