'use client';

import { ChevronLeft, ChevronRight, ListChecks } from 'lucide-react';
import * as React from 'react';
import { ListeningPlayer } from '@/components/listening/listening-player';
import { QuestionNavigatorGrid, type NavigatorItem } from '@/components/quiz/question-navigator-grid';
import { ReadingWorkspace } from '@/components/reading/reading-workspace';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { AnswerResponse, Attempt, QuestionPublic } from '@/contracts/attempts';
import { useShortcutPref } from '@/hooks/use-shortcut-pref';
import { fmt, id } from '@/i18n/id';
import type { Passage } from '@/lib/reading/parsePassages';
import { QuestionGroupList, type QuestionRow } from './question-group';

export type QuestionGroup = { key: number; rows: QuestionRow[] };

/** Apakah attempt memakai tata letak kelompok (Reading split-screen / Listening ber-Section). */
export function isGroupedAttempt(attempt: Attempt): boolean {
  return attempt.passage_markdown !== null || attempt.listening !== null;
}

/**
 * Mengelompokkan soal: Reading per `passage_no` (null atau di luar jumlah teks -> Teks 1, dengan `warn`),
 * Listening per `section_no` (null -> Section 1). Nomor soal bersifat global (urutan di attempt).
 */
export function groupQuestions(questions: QuestionPublic[], reading: boolean, passageCount: number): QuestionGroup[] {
  const map = new Map<number, QuestionRow[]>();
  questions.forEach((q, i) => {
    let key = 1;
    if (reading) {
      const pn = q.passage_no ?? 1;
      if (pn >= 1 && pn <= passageCount) key = pn;
      else console.warn(`passage_no ${pn} di luar jumlah teks (${passageCount}); soal ${q.question_id} dikelompokkan ke Teks 1.`);
    } else {
      key = q.section_no ?? 1;
    }
    map.set(key, [...(map.get(key) ?? []), { q, number: i + 1 }]);
  });
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([key, rows]) => ({ key, rows }));
}

export function keyOfQuestion(q: QuestionPublic, reading: boolean, passageCount: number): number {
  if (!reading) return q.section_no ?? 1;
  const pn = q.passage_no ?? 1;
  return pn >= 1 && pn <= passageCount ? pn : 1;
}

export type GroupedBodyProps = {
  attempt: Attempt;
  passages: Passage[] | null;
  passageError: string | null;
  index: number;
  responses: Record<string, AnswerResponse | null>;
  onChange: (questionId: string, next: AnswerResponse | null) => void;
  disabled: boolean;
  flagged: Set<string>;
  onToggleFlag: (questionId: string) => void;
  unsaved: Set<string>;
  onFocusQuestion: (questionId: string) => void;
  onSelectGroup: (firstIndex: number) => void;
  /** Naik tiap navigasi eksplisit (prev/next/navigator); memindahkan fokus ke soal aktif. */
  focusRequest: number;
};

export function GroupedExamBody(p: GroupedBodyProps) {
  const { attempt, index } = p;
  const questions = attempt.questions;
  const reading = attempt.passage_markdown !== null;
  const passageCount = p.passages?.length ?? Math.max(1, ...questions.map((q) => q.passage_no ?? 1));
  const groups = React.useMemo(() => groupQuestions(questions, reading, passageCount), [questions, reading, passageCount]);
  const current = questions[index];
  const activeKey = current ? keyOfQuestion(current, reading, passageCount) : 1;
  const active = groups.find((g) => g.key === activeKey) ?? groups[0];
  const legendRefs = React.useRef(new Map<string, HTMLLegendElement | null>());
  const currentId = current?.question_id;

  const indexRef = React.useRef(index);
  indexRef.current = index;
  React.useEffect(() => {
    if (p.focusRequest === 0) return;
    const q = questions[indexRef.current];
    if (!q) return;
    const el = legendRefs.current.get(q.question_id);
    el?.focus();
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [p.focusRequest, questions, activeKey]);

  const selectGroup = (key: number) => {
    const g = groups.find((x) => x.key === key);
    if (g?.rows[0]) p.onSelectGroup(g.rows[0].number - 1);
  };

  const list = (g: QuestionGroup) => (
    <QuestionGroupList
      rows={g.rows}
      responses={p.responses}
      onChange={p.onChange}
      disabled={p.disabled}
      flagged={p.flagged}
      onToggleFlag={p.onToggleFlag}
      unsaved={p.unsaved}
      currentId={currentId}
      onFocusQuestion={p.onFocusQuestion}
      legendRefs={legendRefs}
    />
  );

  const range = (g: QuestionGroup) => {
    const a = g.rows[0]!.number;
    const b = g.rows[g.rows.length - 1]!.number;
    return { a, b };
  };

  const listening = attempt.listening ? (
    <ListeningPlayer
      mode="EXAM"
      audioUrl={attempt.listening.audio_url}
      durationSec={attempt.listening.duration_sec}
      attemptId={attempt.id}
    />
  ) : null;

  if (reading) {
    return (
      <ReadingWorkspace
        attemptId={attempt.id}
        passages={p.passages}
        errorCode={p.passageError}
        passageNo={activeKey}
        onPassageNo={selectGroup}
        questionsTitle={
          active
            ? fmt(range(active).a === range(active).b ? id.reading.questionsOfOne : id.reading.questionsOf, {
                n: active.key,
                a: range(active).a,
                b: range(active).b,
              })
            : undefined
        }
        renderQuestions={(layout) => (
          <div className="grid gap-6">
            {listening}
            {layout === 'split' ? (
              active ? list(active) : null
            ) : (
              groups.map((g) => (
                <section key={g.key} aria-labelledby={`grp-${g.key}`} className="grid gap-3">
                  <h3 id={`grp-${g.key}`} className="text-base font-bold">
                    {fmt(id.reading.questionsGroup, { n: g.key })}
                  </h3>
                  {list(g)}
                </section>
              ))
            )}
          </div>
        )}
      />
    );
  }

  const multi = groups.length > 1;
  return (
    <div className="grid gap-4">
      <div className="lg:sticky lg:top-14 lg:z-20 lg:bg-background lg:pb-2">{listening}</div>
      {multi ? (
        <Tabs value={String(activeKey)} onValueChange={(v) => selectGroup(Number(v))}>
          <TabsList aria-label={id.listening.sections} className="h-11 w-full sm:w-fit">
            {groups.map((g) => (
              <TabsTrigger key={g.key} value={String(g.key)} className="h-full px-4">
                {fmt(id.listening.sectionN, { n: g.key })}
              </TabsTrigger>
            ))}
          </TabsList>
          {groups.map((g) => (
            <TabsContent key={g.key} value={String(g.key)} className="pt-3">
              {list(g)}
            </TabsContent>
          ))}
        </Tabs>
      ) : active ? (
        list(active)
      ) : null}
    </div>
  );
}

/** Bilah bawah Mode Ujian: sebelumnya/berikutnya, daftar soal (Sheet bawah), dan Kirim (Dialog konfirmasi di ExamShell). */
export function GroupedFooter({
  index,
  total,
  items,
  answeredCount,
  submitting,
  statusText,
  navigate,
  openEnd,
  submitLabel,
}: {
  index: number;
  total: number;
  items: NavigatorItem[];
  answeredCount: number;
  submitting: boolean;
  statusText: string;
  navigate: (i: number) => void;
  openEnd: () => void;
  /** Teks tombol akhir; default "Kirim" (Boss: "Selesai Section"). */
  submitLabel?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [shortcuts] = useShortcutPref();
  // Alt+Panah Kanan/Kiri = soal berikutnya/sebelumnya (dapat dimatikan di /profil).
  React.useEffect(() => {
    if (!shortcuts || submitting) return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      // Selalu preventDefault (juga di soal pertama/terakhir) agar tidak memicu Back/Forward peramban (F-10-04).
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (index < total - 1) navigate(index + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (index > 0) navigate(index - 1);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [shortcuts, submitting, index, total, navigate]);
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => navigate(index - 1)} disabled={index <= 0 || submitting}>
          <ChevronLeft aria-hidden="true" />
          {id.exam.run.prev}
        </Button>
        <Button variant="outline" onClick={() => navigate(index + 1)} disabled={index >= total - 1 || submitting}>
          {id.exam.run.next}
          <ChevronRight aria-hidden="true" />
        </Button>
        <Button variant="ghost" onClick={() => setOpen(true)}>
          <ListChecks aria-hidden="true" />
          {id.exam.run.questionList} · {fmt(id.exam.run.answeredCount, { n: answeredCount, total })}
        </Button>
      </div>
      <div className="flex items-center gap-3">
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          {statusText}
        </p>
        <Button onClick={openEnd} disabled={submitting} loading={submitting}>
          {submitLabel ?? id.exam.run.submit}
        </Button>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{id.exam.run.questionList}</SheetTitle>
            <SheetDescription>{id.exam.run.questionListDesc}</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            <QuestionNavigatorGrid
              items={items}
              currentIndex={index}
              onSelect={(i) => {
                setOpen(false);
                navigate(i);
              }}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
