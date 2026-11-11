'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Check,
  Clock,
  Copy,
  Headphones,
  Send,
} from 'lucide-react';
import { simulationsApi } from '@/lib/api/simulations';
import { attemptsApi } from '@/lib/api/attempts';
import { AnswerResponseSchema, type AnswerResponse, type QuestionPublic } from '@/contracts/attempts';
import { QuestionRenderer } from '@/components/quiz/question-renderer';
import type { SimulationPart, SimulationSection, SimulationSubmission } from '@/contracts/simulation';
import { fmt, id } from '@/i18n/id';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch } from '@/lib/api/client';
import { PassageMarkdown } from '@/components/reading/passage-markdown';

export function SimulationRunner({ attemptId }: { attemptId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: sim, isLoading: simLoading, refetch: refetchSim } = useQuery({
    queryKey: ['simulations', attemptId],
    queryFn: () => simulationsApi.getSimulation(attemptId),
    refetchInterval: 15000,
  });

  // Tentukan section aktif
  const [selectedSec, setSelectedSec] = React.useState<SimulationSection | null>(null);

  React.useEffect(() => {
    if (sim?.sections) {
      if (sim.status === 'GRADED') {
        router.replace(`/simulasi/${attemptId}/hasil`);
        return;
      }
      if (!selectedSec) {
        // Cari section yang IN_PROGRESS atau NOT_STARTED
        const inProgress = sim.sections.find((s) => s.status === 'IN_PROGRESS');
        if (inProgress) {
          setSelectedSec(inProgress.section);
        } else {
          const notStarted = sim.sections.find((s) => s.status === 'NOT_STARTED');
          if (notStarted) setSelectedSec(notStarted.section);
          else router.replace(`/simulasi/${attemptId}/hasil`);
        }
      }
    }
  }, [sim, selectedSec, attemptId, router]);

  const activeSection = selectedSec ?? sim?.sections[0]?.section ?? 'READING';
  const currentSectionState = sim?.sections.find((s) => s.section === activeSection);

  const isStarted = Boolean(currentSectionState?.started_at);

  const {
    data: detail,
    isLoading: detailLoading,
    refetch: refetchDetail,
  } = useQuery({
    queryKey: ['simulations', attemptId, 'section', activeSection],
    queryFn: () => simulationsApi.getSectionDetail(attemptId, activeSection),
    enabled: isStarted,
  });

  // Timer Countdown
  const [timeLeft, setTimeLeft] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (detail?.remaining_seconds !== undefined && detail.remaining_seconds !== null) {
      setTimeLeft(detail.remaining_seconds);
    } else if (currentSectionState?.remaining_seconds !== undefined && currentSectionState.remaining_seconds !== null) {
      setTimeLeft(currentSectionState.remaining_seconds);
    }
  }, [detail?.remaining_seconds, currentSectionState?.remaining_seconds]);

  const startMutation = useMutation({
    mutationFn: () => simulationsApi.startSection(attemptId, activeSection),
    onSuccess: () => {
      refetchSim();
      refetchDetail();
    },
    onError: (err: unknown) => {
      alert((err as { message?: string })?.message || 'Gagal memulai section');
    },
  });

  const submitMutation = useMutation({
    mutationFn: () => simulationsApi.submitSection(attemptId, activeSection),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['simulations', attemptId] });
      refetchSim().then((fresh) => {
        const next = fresh.data?.sections.find((s) => s.status === 'NOT_STARTED' || s.status === 'IN_PROGRESS');
        if (next) {
          setSelectedSec(next.section);
        } else {
          router.replace(`/simulasi/${attemptId}/hasil`);
        }
      });
    },
    onError: (err: unknown) => {
      alert((err as { message?: string })?.message || 'Gagal mengirim section');
    },
  });

  const handleTimeExpired = React.useCallback(() => {
    if (activeSection === 'SPEAKING') return;
    submitMutation.mutate();
  }, [activeSection, submitMutation]);

  React.useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          handleTimeExpired();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [timeLeft, handleTimeExpired]);

  if (simLoading) {
    return (
      <div className="w-full space-y-6 py-12">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!sim || !currentSectionState) {
    return (
      <div className="w-full py-12 text-center">
        <AlertCircle className="mx-auto size-12 text-destructive" />
        <h2 className="mt-4 text-xl font-bold">Simulasi tidak ditemukan</h2>
      </div>
    );
  }

  const formatTimer = (sec: number | null) => {
    if (sec === null) return '--:--';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const isLowTime = timeLeft !== null && timeLeft <= 300;

  return (
    <div className="w-full space-y-6 pb-12 pt-2">
      {/* Top Header Runner */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">Mode Ujian Tenang</Badge>
            <span className="text-xs text-muted-foreground">{id.simulation.disclaimer}</span>
          </div>
          <h1 className="mt-1 font-heading text-xl font-bold">
            {fmt(id.simulation.runner.sectionTitle, {
              current: currentSectionState.order,
              total: sim.sections.length,
              name: id.simulation.sections[activeSection],
            })}
          </h1>
        </div>

        {/* Timer Box */}
        {isStarted && currentSectionState.time_limit_seconds && (
          <div
            className={`flex items-center gap-2 rounded-lg border px-4 py-2 ${
              isLowTime ? 'border-destructive bg-destructive/10 text-destructive' : 'bg-muted/40'
            }`}
          >
            <Clock className="size-5" />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {id.simulation.runner.timeRemaining}
              </p>
              <p className="font-mono text-xl font-bold">{formatTimer(timeLeft)}</p>
            </div>
          </div>
        )}
      </div>

      {/* Screen Belum Start */}
      {!isStarted && (
        <Card className="mx-auto max-w-xl text-center">
          <CardHeader>
            <CardTitle className="text-xl">
              Siap Memulai {id.simulation.sections[activeSection]}?
            </CardTitle>
            <CardDescription className="pt-2 text-sm">
              {activeSection === 'READING' && 'Reading terdiri dari 3 teks dengan 40 soal dalam batas waktu 60 menit.'}
              {activeSection === 'LISTENING' &&
                'Listening terdiri dari 4 bagian dengan 40 soal. Audio diputar tepat sekali.'}
              {activeSection === 'WRITING' &&
                'Writing terdiri dari Task 1 (surat) dan Task 2 (esai) dalam batas waktu 60 menit.'}
              {activeSection === 'SPEAKING' &&
                'Speaking terdiri dari Part 1, 2, dan 3. Salin prompt ke AI pihak ketiga lalu masukkan skor band.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="rounded-lg bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
              {fmt(id.simulation.runner.startConfirm, { section: id.simulation.sections[activeSection] })}
            </p>
            <Button
              size="lg"
              disabled={startMutation.isPending}
              onClick={() => startMutation.mutate()}
            >
              {fmt(id.simulation.runner.startBtn, { section: id.simulation.sections[activeSection] })}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Screen Setelah Start */}
      {isStarted && (
        <div className="space-y-6">
          {detailLoading && !detail ? (
            <div className="space-y-4">
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : detail ? (
            <>
              {/* Bagian Soal / Workspace berdasarkan tipe section */}
              {activeSection === 'READING' && (
                <ReadingWorkspaceSection
                  attemptId={attemptId}
                  parts={detail.parts}
                  questions={detail.questions}
                  savedAnswers={detail.answers}
                />
              )}

              {activeSection === 'LISTENING' && (
                <ListeningWorkspaceSection
                  attemptId={attemptId}
                  parts={detail.parts}
                  questions={detail.questions}
                  savedAnswers={detail.answers}
                />
              )}

              {activeSection === 'WRITING' && (
                <WritingWorkspaceSection
                  attemptId={attemptId}
                  questions={detail.questions}
                  submissions={detail.submissions}
                  onSubmitted={() => refetchDetail()}
                />
              )}

              {activeSection === 'SPEAKING' && (
                <SpeakingWorkspaceSection
                  attemptId={attemptId}
                  questions={detail.questions}
                  submissions={detail.submissions}
                  onSubmitted={() => {
                    refetchSim();
                    refetchDetail();
                  }}
                />
              )}

              {/* Tombol Submit Section */}
              {activeSection !== 'SPEAKING' && (
                <div className="flex justify-end border-t pt-4">
                  <Button
                    size="lg"
                    disabled={submitMutation.isPending}
                    onClick={() => {
                      if (confirm(fmt(id.simulation.runner.submitConfirm, { section: id.simulation.sections[activeSection] }))) {
                        submitMutation.mutate();
                      }
                    }}
                  >
                    <Send className="mr-2 size-4" />
                    {fmt(id.simulation.runner.submitConfirm, { section: id.simulation.sections[activeSection] })}
                  </Button>
                </div>
              )}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────── READING WORKSPACE ─────────────────────────────
function ReadingWorkspaceSection({
  attemptId,
  parts,
  questions,
  savedAnswers,
}: {
  attemptId: string;
  parts: SimulationPart[];
  questions: QuestionPublic[];
  savedAnswers: Array<{ question_id: string; response: Record<string, unknown> }>;
}) {
  const [activePart, setActivePart] = React.useState(1);
  const part = parts.find((p) => p.part_no === activePart) ?? parts[0];
  const partQuestions = questions.filter((q) => part?.question_ids.includes(q.question_id));

  const [answers, setAnswers] = React.useState<Record<string, Record<string, unknown>>>(() => {
    const init: Record<string, Record<string, unknown>> = {};
    for (const a of savedAnswers) init[a.question_id] = a.response;
    return init;
  });

  const handleSaveAnswer = async (questionId: string, response: Record<string, unknown>) => {
    setAnswers((prev) => ({ ...prev, [questionId]: response }));
    try {
      await attemptsApi.answer(attemptId, questionId, response as AnswerResponse);
    } catch (e) {
      console.error('Failed to save answer', e);
    }
  };

  return (
    <div className="space-y-4">
      {/* Tab Part Selector */}
      <div className="flex gap-2">
        {parts.map((p) => (
          <Button
            key={p.part_no}
            variant={activePart === p.part_no ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActivePart(p.part_no)}
          >
            Teks {p.part_no} ({p.question_ids.length} Soal)
          </Button>
        ))}
      </div>

      {/* Split Screen Passage & Questions */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Kolom Teks Bacaan */}
        <Card className="h-[600px] overflow-y-auto bg-muted/20">
          <CardHeader className="sticky top-0 z-10 border-b bg-card/90 py-3 backdrop-blur">
            <CardTitle className="text-sm font-semibold">Teks Bacaan {activePart}</CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            <PassageMarkdown markdown={part?.passage_markdown ?? ''} />
          </CardContent>
        </Card>

        {/* Kolom Soal */}
        <div className="h-[600px] space-y-4 overflow-y-auto pr-2">
          {partQuestions.map((q, idx) => (
            <ObjectiveQuestionCard
              key={q.question_id}
              question={q}
              index={idx + 1}
              response={answers[q.question_id]}
              onAnswer={(res) => handleSaveAnswer(q.question_id, res)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────── LISTENING WORKSPACE ─────────────────────────────
function ListeningWorkspaceSection({
  attemptId,
  parts,
  questions,
  savedAnswers,
}: {
  attemptId: string;
  parts: SimulationPart[];
  questions: QuestionPublic[];
  savedAnswers: Array<{ question_id: string; response: Record<string, unknown> }>;
}) {
  const [activePart, setActivePart] = React.useState(1);
  const part = parts.find((p) => p.part_no === activePart) ?? parts[0];
  const partQuestions = questions.filter((q) => part?.question_ids.includes(q.question_id));

  const [answers, setAnswers] = React.useState<Record<string, Record<string, unknown>>>(() => {
    const init: Record<string, Record<string, unknown>> = {};
    for (const a of savedAnswers) init[a.question_id] = a.response;
    return init;
  });

  const handleSaveAnswer = async (questionId: string, response: Record<string, unknown>) => {
    setAnswers((prev) => ({ ...prev, [questionId]: response }));
    try {
      await attemptsApi.answer(attemptId, questionId, response as AnswerResponse);
    } catch (e) {
      console.error('Failed to save answer', e);
    }
  };

  return (
    <div className="space-y-4">
      {/* Tab Part Selector */}
      <div className="flex gap-2">
        {parts.map((p) => (
          <Button
            key={p.part_no}
            variant={activePart === p.part_no ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActivePart(p.part_no)}
          >
            Bagian {p.part_no} ({p.question_ids.length} Soal)
          </Button>
        ))}
      </div>

      {/* Audio Player Card */}
      {part?.listening && (
        <Card className="bg-primary/5">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Headphones className="size-5 text-primary" />
              <div>
                <p className="text-sm font-semibold">Audio Bagian {activePart}</p>
                <p className="text-xs text-muted-foreground">Diputar satu kali sesuai kondisi ujian resmi.</p>
              </div>
            </div>
            <audio controls src={part.listening.audio_url} className="w-full sm:w-64" />
          </CardContent>
        </Card>
      )}

      {/* Soal-soal */}
      <div className="space-y-4">
        {partQuestions.map((q, idx) => (
          <ObjectiveQuestionCard
            key={q.question_id}
            question={q}
            index={idx + 1}
            response={answers[q.question_id]}
            onAnswer={(res) => handleSaveAnswer(q.question_id, res)}
          />
        ))}
      </div>
    </div>
  );
}

// ───────────────────────────── OBJECTIVE QUESTION CARD ─────────────────────────────
function ObjectiveQuestionCard({
  question,
  index,
  response,
  onAnswer,
}: {
  question: QuestionPublic;
  index: number;
  response: Record<string, unknown> | undefined;
  onAnswer: (resp: Record<string, unknown>) => void;
}) {
  // Semua tipe soal (MCQ tunggal/ganda, TFNG/YNNG, isian, matching, reorder, error recognition) memakai renderer
  // yang sama dengan Active Drill dan Ujian. Jawaban disimpan setelah jeda singkat agar mengetik tidak mengirim
  // permintaan per ketukan; jawaban kosong/tak lengkap (null) tidak dikirim.
  const [value, setValue] = React.useState<AnswerResponse | null>(() => {
    const parsed = AnswerResponseSchema.safeParse(response);
    return parsed.success ? parsed.data : null;
  });
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = React.useRef<AnswerResponse | null>(null);
  const onAnswerRef = React.useRef(onAnswer);
  onAnswerRef.current = onAnswer;
  React.useEffect(
    () => () => {
      // Keluar dari kartu (ganti bagian/section): simpan jawaban yang masih tertunda.
      if (timer.current) clearTimeout(timer.current);
      if (pending.current) onAnswerRef.current(pending.current);
    },
    [],
  );
  const onChange = (next: AnswerResponse | null) => {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    pending.current = next;
    if (!next) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      pending.current = null;
      onAnswer(next);
    }, 600);
  };

  return (
    <Card className="p-4" data-testid="sim-question" data-question-type={question.question_type}>
      <div className="flex items-start gap-3">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
          {index}
        </span>
        <div className="min-w-0 flex-1 text-sm [&_legend]:text-sm [&_legend]:font-medium">
          <QuestionRenderer question={question} value={value} onChange={onChange} disabled={false} feedback={null} />
        </div>
      </div>
    </Card>
  );
}

// ───────────────────────────── WRITING WORKSPACE ─────────────────────────────
function WritingWorkspaceSection({
  attemptId,
  questions,
  submissions,
  onSubmitted,
}: {
  attemptId: string;
  questions: QuestionPublic[];
  submissions: SimulationSubmission[];
  onSubmitted: () => void;
}) {
  const t1 = questions.find((q) => q.ai_task?.task_kind === 'TASK1') ?? questions[0];
  const t2 = questions.find((q) => q.ai_task?.task_kind === 'TASK2') ?? questions[1];

  const [activeTask, setActiveTask] = React.useState<1 | 2>(1);
  const currentQ = activeTask === 1 ? t1 : t2;

  const currentSub = submissions.find((s) => s.question_id === currentQ?.question_id);

  const [texts, setTexts] = React.useState<Record<string, string>>({});
  const currentText = currentQ ? (texts[currentQ.question_id] ?? '') : '';

  const wordCount = currentText.trim().length === 0 ? 0 : currentText.trim().split(/\s+/).length;
  const minWords = activeTask === 1 ? 150 : 250;

  const [saving, setSaving] = React.useState(false);

  const handleSaveWriting = async () => {
    if (!currentQ || currentText.trim().length === 0) return;
    setSaving(true);
    try {
      await apiFetch('/submissions/writing', {
        method: 'POST',
        body: {
          attempt_id: attemptId,
          question_id: currentQ.question_id,
          kind: activeTask === 1 ? 'WRITING_TASK1' : 'WRITING_TASK2',
          response_text: currentText,
        },
      });
      onSubmitted();
    } catch (e: unknown) {
      alert((e as { message?: string })?.message || 'Gagal menyimpan tulisan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Tab Task 1 & Task 2 */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button
            variant={activeTask === 1 ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTask(1)}
          >
            Task 1 (Surat)
          </Button>
          <Button
            variant={activeTask === 2 ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTask(2)}
          >
            Task 2 (Esai)
          </Button>
        </div>
        <span className="text-xs text-muted-foreground">{id.simulation.runner.writingTips}</span>
      </div>

      {/* Prompt Card */}
      <Card className="bg-muted/20">
        <CardContent className="p-4">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{currentQ?.prompt}</p>
        </CardContent>
      </Card>

      {/* Editor Area */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Jumlah Kata: <strong className={wordCount < minWords ? 'text-amber-600' : 'text-green-600'}>{wordCount}</strong> / min {minWords} kata
          </span>
          {currentSub && (
            <Badge variant="outline" className="text-xs">
              Terkirim untuk dinilai
            </Badge>
          )}
        </div>
        <Textarea
          rows={14}
          placeholder="Tuliskan jawaban esai Anda di sini..."
          value={currentText}
          onChange={(e) => setTexts((prev) => ({ ...prev, [currentQ?.question_id]: e.target.value }))}
          className="font-mono text-sm leading-relaxed"
        />
        <div className="flex justify-end">
          <Button size="sm" disabled={saving || currentText.trim().length === 0} onClick={handleSaveWriting}>
            {saving ? 'Menyimpan...' : 'Kirim Task Ini'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────── SPEAKING WORKSPACE ─────────────────────────────
function SpeakingWorkspaceSection({
  attemptId,
  questions,
  submissions,
  onSubmitted,
}: {
  attemptId: string;
  questions: QuestionPublic[];
  submissions: SimulationSubmission[];
  onSubmitted: () => void;
}) {
  const [activePart, setActivePart] = React.useState<1 | 2 | 3>(1);

  const partQuestions = questions.filter(
    (q) => q.ai_task?.part === activePart || (q as unknown as { part?: number }).part === activePart,
  );
  const partFirstQ = partQuestions[0];

  const [copied, setCopied] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const [scores, setScores] = React.useState({
    fluency: 6.0,
    lexical: 6.0,
    grammar: 6.0,
    pronunciation: 6.0,
  });

  const fullPromptText = React.useMemo(() => {
    let t = `IELTS Speaking Part ${activePart} Test:\n\n`;
    for (const q of partQuestions) {
      t += `- ${q.prompt}\n`;
    }
    t += `\nPlease evaluate my answers across 4 criteria (Fluency, Lexical, Grammar, Pronunciation) with IELTS band scores 0-9.`;
    return t;
  }, [activePart, partQuestions]);

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(fullPromptText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmitSpeakingPart = async () => {
    if (!partFirstQ) return;
    setSaving(true);
    try {
      await apiFetch('/submissions/speaking-external', {
        method: 'POST',
        body: {
          attempt_id: attemptId,
          question_id: partFirstQ.question_id,
          kind: `SPEAKING_PART${activePart}`,
          tool: 'CHATGPT',
          criteria_scores: scores,
        },
      });
      onSubmitted();
    } catch (e: unknown) {
      alert((e as { message?: string })?.message || 'Gagal menyimpan skor speaking');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Tab Part Selector */}
      <div className="flex gap-2">
        {([1, 2, 3] as const).map((p) => {
          const isDone = submissions.some((s) =>
            questions
              .filter(
                (q) =>
                  q.ai_task?.part === p ||
                  (q as unknown as { part?: number }).part === p,
              )
              .map((q) => q.question_id)
              .includes(s.question_id),
          );
          return (
            <Button
              key={p}
              variant={activePart === p ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActivePart(p)}
            >
              Part {p} {isDone && '✓'}
            </Button>
          );
        })}
      </div>

      {/* Guide Banner */}
      <div className="rounded-lg bg-primary/10 p-4 text-xs leading-relaxed text-primary">
        {id.simulation.runner.speakingGuide}
      </div>

      {/* Prompt Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-semibold">Prompt Part {activePart}</CardTitle>
          <Button variant="outline" size="sm" onClick={handleCopyPrompt}>
            {copied ? <Check className="mr-2 size-4 text-green-600" /> : <Copy className="mr-2 size-4" />}
            {copied ? id.simulation.runner.promptCopied : id.simulation.runner.copyPrompt}
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {partQuestions.map((q) => (
            <p key={q.question_id} className="text-sm">
              • {q.prompt}
            </p>
          ))}
        </CardContent>
      </Card>

      {/* Form Input Skor 4 Kriteria */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Input Skor Evaluasi AI Eksternal</CardTitle>
          <CardDescription className="text-xs">
            Masukkan nilai band per kriteria (kelipatan 0.5 atau bulat antara 0.0 sampai 9.0).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <Label className="text-xs">Fluency & Coherence</Label>
              <Input
                type="number"
                step="0.5"
                min="0"
                max="9"
                value={scores.fluency}
                onChange={(e) => setScores((s) => ({ ...s, fluency: parseFloat(e.target.value) || 0 }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Lexical Resource</Label>
              <Input
                type="number"
                step="0.5"
                min="0"
                max="9"
                value={scores.lexical}
                onChange={(e) => setScores((s) => ({ ...s, lexical: parseFloat(e.target.value) || 0 }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Grammar Range & Acc.</Label>
              <Input
                type="number"
                step="0.5"
                min="0"
                max="9"
                value={scores.grammar}
                onChange={(e) => setScores((s) => ({ ...s, grammar: parseFloat(e.target.value) || 0 }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Pronunciation</Label>
              <Input
                type="number"
                step="0.5"
                min="0"
                max="9"
                value={scores.pronunciation}
                onChange={(e) => setScores((s) => ({ ...s, pronunciation: parseFloat(e.target.value) || 0 }))}
                className="mt-1"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button size="sm" disabled={saving} onClick={handleSubmitSpeakingPart}>
              {saving ? 'Menyimpan...' : `Simpan Skor Part ${activePart}`}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
