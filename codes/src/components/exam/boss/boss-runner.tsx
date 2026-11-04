'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { ErrorState } from '@/components/common/state-views';
import { Skeleton } from '@/components/ui/skeleton';
import type { Attempt } from '@/contracts/attempts';
import { id } from '@/i18n/id';
import { attemptsApi } from '@/lib/api/attempts';
import { bossApi } from '@/lib/api/boss';
import { SectionsSchema, type Section, type StartSectionData, type SubmitSectionData } from '@/lib/api/boss-contract';
import { isApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/errors';
import { ExamSession, type ExamSectionBinding } from '../exam-runner';
import { BossAiSection } from './ai-section';
import { SectionDone, SectionGate } from './section-screens';

type View =
  | { kind: 'resuming'; sectionId: string }
  | { kind: 'gate'; sectionId: string }
  | { kind: 'running'; data: StartSectionData }
  | { kind: 'done'; sectionId: string; nextId: string | null; timedOut: boolean }
  | { kind: 'finish' };

const ATTEMPT_ENDED = ['ATTEMPT_EXPIRED', 'ATTEMPT_NOT_ACTIVE'];

function sortSections(list: Section[]): Section[] {
  return [...list].sort((a, b) => a.order - b.order);
}

/** Tampilan awal dari status section: ACTIVE dilanjutkan (start idempoten), selain itu section PENDING pertama. */
function initialView(sections: Section[]): View {
  const active = sections.find((s) => s.phase === 'ACTIVE');
  if (active) return { kind: 'resuming', sectionId: active.assessment_set_id };
  const pending = sections.find((s) => s.phase === 'PENDING');
  if (pending) return { kind: 'gate', sectionId: pending.assessment_set_id };
  return { kind: 'finish' };
}

/** Attempt "semu" untuk satu section: soal, teks, audio, dan jawaban tersimpan dari `start`; timer dari section. */
export function sectionAttempt(base: Attempt, data: StartSectionData): Attempt {
  return {
    ...base,
    title: data.section.title,
    server_now: data.server_now,
    deadline_at: data.section.deadline_at,
    remaining_seconds: data.section.remaining_seconds,
    time_limit_seconds: data.section.time_limit_seconds,
    question_count: data.questions.length,
    answered_count: data.answers.length,
    current_index: 0,
    passage_markdown: data.passage_markdown,
    listening: data.listening,
    questions: data.questions,
    answers: data.answers,
    sections: null,
  };
}

/**
 * Alur Boss Stage bersegmen (SPEC-014): layar transisi -> section berjalan -> layar selesai -> ... -> kirim attempt
 * -> hasil. Server menentukan urutan, waktu section, dan hasil; klien hanya menampilkan dan memanggil endpoint.
 */
export function BossRunner({ attempt }: { attempt: Attempt }) {
  const router = useRouter();
  const parsed = React.useMemo(() => SectionsSchema.safeParse(attempt.sections), [attempt.sections]);
  const [sections, setSections] = React.useState<Section[]>(() => (parsed.success ? sortSections(parsed.data) : []));
  const [view, setView] = React.useState<View>(() => (parsed.success ? initialView(sortSections(parsed.data)) : { kind: 'finish' }));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const busyRef = React.useRef(false);
  const resumedRef = React.useRef<string | null>(null);
  const sectionsRef = React.useRef(sections);
  sectionsRef.current = sections;

  const allowLeave = React.useRef(false);
  const goResult = React.useCallback(() => {
    allowLeave.current = true;
    router.replace(`/ujian/${attempt.id}/hasil`);
  }, [router, attempt.id]);

  // F-14-07: peringatan keluar selama attempt Boss berjalan, merata di semua layar (transisi, selesai, Writing/Speaking).
  React.useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (allowLeave.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const merge = React.useCallback((...updates: Array<Section | null>) => {
    setSections((cur) => {
      const map = new Map(cur.map((s) => [s.assessment_set_id, s]));
      for (const u of updates) if (u) map.set(u.assessment_set_id, u);
      return sortSections([...map.values()]);
    });
  }, []);

  /** Kirim attempt (idempoten di server) lalu buka hasil. Gagal jaringan: tetap di layar dengan tombol coba lagi. */
  const finalize = React.useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await attemptsApi.submit(attempt.id);
      goResult();
    } catch (e) {
      if (isApiError(e) && ATTEMPT_ENDED.includes(e.code)) {
        goResult();
        return;
      }
      busyRef.current = false;
      setBusy(false);
      setError(id.boss.done.finishFailed);
    }
  }, [attempt.id, goResult]);

  /** Muat ulang daftar section dari server (mis. setelah urutan tidak cocok) dan hitung ulang tampilan. */
  const reload = React.useCallback(async () => {
    try {
      const fresh = await attemptsApi.get(attempt.id);
      if (fresh.status !== 'IN_PROGRESS') {
        goResult();
        return;
      }
      const p = SectionsSchema.safeParse(fresh.sections);
      if (!p.success) {
        setError(id.boss.gate.invalidSections);
        return;
      }
      const list = sortSections(p.data);
      setSections(list);
      setView(initialView(list));
    } catch (e) {
      setError(apiErrorMessage(e));
    }
  }, [attempt.id, goResult]);

  const begin = React.useCallback(
    async (sectionId: string) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setError(null);
      const release = () => {
        busyRef.current = false;
        setBusy(false);
      };
      try {
        const data = await bossApi.startSection(attempt.id, sectionId);
        merge(data.section);
        release();
        setView({ kind: 'running', data });
      } catch (e) {
        release();
        if (isApiError(e) && ATTEMPT_ENDED.includes(e.code)) {
          void finalize();
        } else if (isApiError(e) && (e.code === 'SECTION_ORDER_VIOLATION' || e.code === 'SECTION_ALREADY_DONE')) {
          toast.error(apiErrorMessage(e));
          await reload();
        } else {
          setError(isApiError(e) && e.code !== 'NETWORK_ERROR' ? apiErrorMessage(e) : id.boss.gate.startFailed);
        }
      }
    },
    [attempt.id, merge, finalize, reload],
  );

  // Section yang sudah ACTIVE (muat ulang/tab ditutup) dilanjutkan otomatis: start bersifat idempoten.
  React.useEffect(() => {
    if (view.kind === 'resuming' && resumedRef.current !== view.sectionId) {
      resumedRef.current = view.sectionId;
      void begin(view.sectionId);
    }
  }, [view, begin]);

  const onSubmitted = React.useCallback(
    (out: SubmitSectionData, timedOut: boolean) => {
      merge(out.section, out.next_section);
      setView({ kind: 'done', sectionId: out.section.assessment_set_id, nextId: out.next_section?.assessment_set_id ?? null, timedOut });
    },
    [merge],
  );

  /** Server menutup section (waktu habis): submit idempoten mengembalikan `next_section`. */
  const onClosed = React.useCallback(
    async (sectionId: string) => {
      try {
        onSubmitted(await bossApi.submitSection(attempt.id, sectionId), true);
      } catch (e) {
        if (isApiError(e) && ATTEMPT_ENDED.includes(e.code)) {
          void finalize();
          return;
        }
        await reload();
      }
    },
    [attempt.id, onSubmitted, finalize, reload],
  );

  if (!parsed.success) {
    return <ErrorState className="mx-auto mt-10 max-w-md" title={id.boss.gate.loadFailed} body={id.boss.gate.invalidSections} />;
  }

  if (view.kind === 'running') {
    const { data } = view;
    const sectionId = data.section.assessment_set_id;
    const binding: ExamSectionBinding = {
      submit: () => bossApi.submitSection(attempt.id, sectionId),
      onSubmitted,
      onClosed: () => void onClosed(sectionId),
    };
    if (data.section.skill === 'WRITING' || data.section.skill === 'SPEAKING') {
      return <BossAiSection key={sectionId} attemptId={attempt.id} data={data} binding={binding} />;
    }
    return <ExamSession key={sectionId} attempt={sectionAttempt(attempt, data)} section={binding} />;
  }

  if (view.kind === 'resuming') {
    if (error) {
      return (
        <ErrorState
          className="mx-auto mt-10 max-w-md"
          title={id.boss.gate.loadFailed}
          body={error}
          onRetry={() => void begin(view.sectionId)}
        />
      );
    }
    return <Skeleton className="mx-auto mt-10 h-96 max-w-2xl rounded-xl" role="status" aria-label={id.common.loading} />;
  }

  if (view.kind === 'gate') {
    const section = sections.find((s) => s.assessment_set_id === view.sectionId);
    if (!section) return <ErrorState className="mx-auto mt-10 max-w-md" title={id.boss.gate.loadFailed} />;
    return (
      <SectionGate
        key={section.assessment_set_id}
        section={section}
        sections={sections}
        starting={busy}
        error={error}
        onStart={() => void begin(section.assessment_set_id)}
      />
    );
  }

  if (view.kind === 'done') {
    const section = sections.find((s) => s.assessment_set_id === view.sectionId);
    const next = view.nextId ? (sections.find((s) => s.assessment_set_id === view.nextId) ?? null) : null;
    if (!section) return <ErrorState className="mx-auto mt-10 max-w-md" title={id.boss.gate.loadFailed} />;
    return (
      <SectionDone
        key={section.assessment_set_id}
        section={section}
        next={next}
        timedOut={view.timedOut}
        finishing={busy}
        error={error}
        onContinue={() => {
          setError(null);
          setView({ kind: 'gate', sectionId: next!.assessment_set_id });
        }}
        onFinish={() => void finalize()}
      />
    );
  }

  // Semua section selesai namun attempt belum dikirim (mis. tab ditutup di antara section terakhir dan kirim).
  const last = sections[sections.length - 1];
  if (!last) return <ErrorState className="mx-auto mt-10 max-w-md" title={id.boss.gate.loadFailed} body={error ?? undefined} onRetry={() => void reload()} />;
  return (
    <SectionDone
      key="finish"
      section={last}
      next={null}
      timedOut={false}
      finishing={busy}
      error={error}
      onContinue={() => undefined}
      onFinish={() => void finalize()}
    />
  );
}
