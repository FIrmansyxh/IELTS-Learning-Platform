/**
 * Handler tipe SKIP_MODULE_TEST / SKIP_TIER_TEST (SPEC-008). Gerbang start (D1-D5), penerapan hasil (D6/D7),
 * dan intro ujian. Satu-satunya jalur tulis ke progres adalah GatekeepingService.
 */
import { writeAudit } from '../audit';
import type { Tx } from '../db';
import { applySkipResult, recomputeStatuses } from '../gatekeeping/service';
import { isAvailable, isStarted, moduleAvailable, skipEligible, type ModuleNode, type Snapshot, type TierNode } from '../gatekeeping/rules';
import { ApiError, notFound } from '../http/errors';
import type { SetRow } from '../attempts/dto';
import type { AssessmentTypeHandler, ExamIntroPart } from '../attempts/handlers';
import { nowDate } from '../clock';
import { countAttemptsInWindow, loadAttemptGate, secondsUntil, type AttemptGate } from './gate';

type SkipType = 'SKIP_MODULE_TEST' | 'SKIP_TIER_TEST';

export interface SkipTarget {
  scope: 'MODULE' | 'TIER';
  id: string;
  label: string;
  thresholdPercent: number;
  /** Entitas AVAILABLE (dipublikasikan dan punya sub-modul tersedia); selain itu set dianggap tidak ada (404). */
  available: boolean;
  /** D1: LOCKED/UNLOCKED dan tidak ada sub-modul yang sudah dimulai. */
  eligible: boolean;
  /** Seluruh sub-modul di bawah target (untuk menghitung yang dilewati). */
  subs: Array<{ id: string; status: string }>;
}

export const tierLabel = (t: TierNode) => `Tier ${t.number}: ${t.title}`;
export const moduleLabel = (m: ModuleNode) => `Modul ${m.code} ${m.title}`;

/** Petakan set Skip ke target pada snapshot. null bila set tidak punya scope yang cocok atau entitas tidak ada. */
export function resolveSkipTarget(snap: Snapshot, set: Pick<SetRow, 'assessmentType' | 'moduleId' | 'tierId'>): SkipTarget | null {
  if (set.assessmentType === 'SKIP_MODULE_TEST') {
    if (!set.moduleId) return null;
    for (const tier of snap.tiers) {
      const mod = tier.modules.find((m) => m.id === set.moduleId);
      if (!mod) continue;
      return {
        scope: 'MODULE',
        id: mod.id,
        label: moduleLabel(mod),
        thresholdPercent: tier.skipThreshold,
        available: mod.review === 'PUBLISHED' && moduleAvailable(mod),
        eligible: skipEligible(mod.status) && mod.subs.every((s) => !isStarted(s.status)),
        subs: mod.subs.filter((s) => isAvailable(mod, s)).map((s) => ({ id: s.id, status: s.status })),
      };
    }
    return null;
  }
  if (set.assessmentType === 'SKIP_TIER_TEST') {
    if (!set.tierId) return null;
    const tier = snap.tiers.find((t) => t.id === set.tierId);
    if (!tier) return null;
    const subs = tier.modules.flatMap((m) => m.subs.filter((s) => isAvailable(m, s)));
    return {
      scope: 'TIER',
      id: tier.id,
      label: tierLabel(tier),
      thresholdPercent: tier.skipThreshold,
      available: tier.modules.some((m) => m.review === 'PUBLISHED' && moduleAvailable(m)),
      eligible: skipEligible(tier.status) && tier.modules.every((m) => m.subs.every((s) => !isStarted(s.status))),
      subs: subs.map((s) => ({ id: s.id, status: s.status })),
    };
  }
  return null;
}

/** "18:30 WIB" pada zona APP_TIMEZONE. */
export function formatClock(d: Date, tz = process.env.APP_TIMEZONE || 'Asia/Jakarta'): string {
  const time = new Intl.DateTimeFormat('id-ID', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .format(d)
    .replace('.', ':');
  const label = tz === 'Asia/Jakarta' ? 'WIB' : tz === 'Asia/Makassar' ? 'WITA' : tz === 'Asia/Jayapura' ? 'WIT' : tz;
  return `${time} ${label}`;
}

const duration = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m} menit` : m === 0 ? `${s} detik` : `${m} menit ${s} detik`;
};

/** Lempar COOLDOWN_ACTIVE / DAILY_ATTEMPT_LIMIT sesuai urutan D5 (4) lalu (5). */
export function assertGateOpen(gate: AttemptGate, now: Date): void {
  if (gate.cooldownUntil) {
    throw new ApiError('COOLDOWN_ACTIVE', {
      message: `Anda dapat mencoba lagi pukul ${formatClock(gate.cooldownUntil)}.`,
      details: [{ path: 'next_allowed_at', code: 'cooldown_active', message: gate.cooldownUntil.toISOString() }],
      headers: { 'Retry-After': String(secondsUntil(gate.cooldownUntil, now)) },
    });
  }
  if (gate.dailyBlocked) {
    throw new ApiError('DAILY_ATTEMPT_LIMIT', {
      headers: { 'Retry-After': String(gate.dailyRetryAt ? secondsUntil(gate.dailyRetryAt, now) : 86400) },
    });
  }
}

function buildRules(set: SetRow, threshold: number, gate: AttemptGate): string[] {
  return [
    `Skor minimal ${threshold}% membuka level berikutnya tanpa membuka materi.`,
    `Waktu ${duration(set.timeLimitSeconds)}, berjalan terus walau Anda keluar halaman.`,
    'Tidak ada pembahasan selama ujian.',
    gate.cooldownMinutes > 0
      ? `Jika belum lulus, tidak ada penalti; Anda dapat mencoba lagi setelah ${gate.cooldownMinutes} menit (maksimal ${gate.maxPerDay} kali per 24 jam).`
      : `Jika belum lulus, tidak ada penalti; Anda dapat mencoba lagi (maksimal ${gate.maxPerDay} kali per 24 jam).`,
  ];
}

export function makeSkipHandler(type: SkipType): AssessmentTypeHandler {
  const scope = type === 'SKIP_MODULE_TEST' ? 'MODULE' : 'TIER';

  const loadTarget = async (tx: Tx, userId: string, set: SetRow): Promise<{ target: SkipTarget; snap: Snapshot }> => {
    const snap = await recomputeStatuses(tx, userId);
    const target = resolveSkipTarget(snap, set);
    if (!target || target.scope !== scope || !target.available) throw notFound(); // D5 (1)
    return { target, snap };
  };

  return {
    async start({ tx, userId, set, now }) {
      const { target } = await loadTarget(tx, userId, set);
      if (!target.eligible) throw new ApiError('SKIP_NOT_AVAILABLE'); // D5 (3)
      assertGateOpen(await loadAttemptGate(tx, userId, set.id, now), now); // D5 (4), (5)
      return {
        mode: 'EXAM',
        passPercent: target.thresholdPercent,
        questionLimit: null, // seluruh questions_json disajikan (urutan diacak)
        keepOrder: Boolean(set.readingPassageMarkdown) || Boolean(set.listeningAssetId),
      };
    },

    async intro({ tx, userId, set, now }): Promise<ExamIntroPart> {
      const { target } = await loadTarget(tx, userId, set);
      const gate = await loadAttemptGate(tx, userId, set.id, now);
      const blocked = !target.eligible ? 'SKIP_NOT_AVAILABLE' : gate.cooldownUntil ? 'COOLDOWN_ACTIVE' : gate.dailyBlocked ? 'DAILY_ATTEMPT_LIMIT' : null;
      return {
        scope: { kind: target.scope, id: target.id, label: target.label },
        threshold: { kind: 'PERCENT', value: target.thresholdPercent },
        rules: buildRules(set, target.thresholdPercent, gate),
        blocked_reason: blocked,
        cooldown: {
          next_allowed_at: gate.cooldownUntil ? gate.cooldownUntil.toISOString() : null,
          attempts_in_window: gate.attemptsInWindow,
          max_attempts: gate.maxPerDay,
        },
        boss: null,
        placement: null,
      };
    },

    async onFinish({ tx, userId, attempt, set, result }) {
      const passed = result.passed === true;
      const before = await recomputeStatuses(tx, userId);
      // F-20-01: modul diarsipkan di tengah Skip Test -> target tidak ada di snapshot. Skor tetap tersimpan; tanpa efek progres.
      const target: SkipTarget = resolveSkipTarget(before, set) ?? {
        scope: set.assessmentType === 'SKIP_TIER_TEST' ? 'TIER' : 'MODULE',
        id: set.moduleId ?? set.tierId ?? set.id,
        label: set.title,
        thresholdPercent: result.passPercent ?? 0,
        available: false,
        eligible: false,
        subs: [],
      };
      const skippedBefore = new Set(target.subs.filter((s) => s.status === 'SKIPPED').map((s) => s.id));

      // D6: persen untuk skip_best_percent; keputusan lulus/gagal sudah ditentukan tepat (D2) oleh mesin attempt.
      // F-08-02: D1 divalidasi ulang saat selesai. Bila pelajar sudah memulai sub-modul target selama ujian, hasil tetap
      // dicatat tetapi TIDAK ada efek pada progres (tidak ada pelewatan/pembukaan).
      const effective = !passed || target.eligible;
      const displayPercent = result.percentDisplayH / 100; // F-08-04: 84,996 tampil 84,99 (bukan 85,00) saat belum lulus
      const applied = effective
        ? await applySkipResult(tx, userId, { scope: target.scope, targetId: target.id, scorePercent: displayPercent, passed })
        : { unlocked: [] as Array<{ id: string }> };
      const after = await recomputeStatuses(tx, userId);
      const afterTarget = resolveSkipTarget(after, set);
      const skippedCount = (afterTarget?.subs ?? []).filter((s) => s.status === 'SKIPPED' && !skippedBefore.has(s.id)).length;

      // `unlocked` kontrak = entitas yang kini terbuka (UNLOCKED); entitas yang dilewati dihitung di skipped_sub_module_count.
      const statusById = new Map<string, string>();
      for (const t of after.tiers) {
        statusById.set(t.id, t.status);
        for (const m of t.modules) {
          statusById.set(m.id, m.status);
          for (const s of m.subs) statusById.set(s.id, s.status);
        }
      }
      const unlocked = passed ? applied.unlocked.filter((u) => statusById.get(u.id) === 'UNLOCKED') : [];

      const submittedAt = attempt.submittedAt ?? nowDate();
      const gate = await loadAttemptGate(tx, userId, set.id, submittedAt);
      const inWindow = await countAttemptsInWindow(tx, userId, set.id, submittedAt);
      const nextAllowed = !passed && gate.cooldownMinutes > 0 ? new Date(submittedAt.getTime() + gate.cooldownMinutes * 60_000) : null;

      await writeAudit(tx, {
        actorUserId: userId,
        action: passed ? 'SKIP_TEST_PASSED' : 'SKIP_TEST_FAILED',
        entityType: 'attempt',
        entityId: attempt.id,
        metadata: { scope: target.scope, target_id: target.id, score_percent: displayPercent, ...(effective ? {} : { effect_skipped: 'not_eligible_at_finish' }) },
      });

      return {
        progress: null,
        skip: {
          passed,
          score_percent: displayPercent,
          threshold_percent: target.thresholdPercent,
          scope: { kind: target.scope, id: target.id, label: target.label },
          skipped_sub_module_count: passed ? skippedCount : 0,
          unlocked,
          retry: {
            next_allowed_at: nextAllowed ? nextAllowed.toISOString() : null,
            attempts_remaining_today: Math.max(0, gate.maxPerDay - inWindow),
          },
        },
      };
    },
  };
}

export const skipModuleHandler = makeSkipHandler('SKIP_MODULE_TEST');
export const skipTierHandler = makeSkipHandler('SKIP_TIER_TEST');
