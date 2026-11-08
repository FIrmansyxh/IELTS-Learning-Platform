import type { SimulationSection, SimulationOverallResult } from '@/contracts/simulation';

/**
 * SPEC-023 D4: Aturan pembulatan band IELTS.
 * roundBand(x) = floor(2x + 0.5) / 2
 * Menggunakan aritmetika setengah-band (h = band * 2):
 * Untuk jumlah berbobot W dan pembagi n:
 * h_res = floor((2*W + n) / (2*n))
 * band = h_res / 2
 */
export function roundWeightedBand(weightsAndBands: Array<{ weight: number; band: number }>): number {
  if (weightsAndBands.length === 0) return 0;
  let W = 0;
  let n = 0;
  for (const item of weightsAndBands) {
    const h = Math.round(item.band * 2);
    W += item.weight * h;
    n += item.weight;
  }
  if (n === 0) return 0;
  const hRes = Math.floor((2 * W + n) / (2 * n));
  return hRes / 2;
}

export function roundBand(x: number): number {
  return Math.floor(2 * x + 0.5) / 2;
}

/**
 * Band Writing = (Task 1 * 1 + Task 2 * 2) / 3 dengan aturan D4.
 * Task kosong dihitung band 0.
 */
export function computeWritingBand(t1Band: number | null, t2Band: number | null): number {
  const b1 = t1Band ?? 0;
  const b2 = t2Band ?? 0;
  return roundWeightedBand([
    { weight: 1, band: b1 },
    { weight: 2, band: b2 },
  ]);
}

/**
 * Band Speaking = rata-rata 3 part dengan aturan D4.
 * Mengembalikan null bila belum ketiga-tiganya dinilai.
 */
export function computeSpeakingBand(
  p1Band: number | null,
  p2Band: number | null,
  p3Band: number | null,
): number | null {
  if (p1Band === null || p2Band === null || p3Band === null) return null;
  return roundWeightedBand([
    { weight: 1, band: p1Band },
    { weight: 1, band: p2Band },
    { weight: 1, band: p3Band },
  ]);
}

/**
 * Perhitungan Overall D4:
 * - COMPLETE: tepat 4 section dipilih dan semua GRADED.
 * - PARTIAL_SELECTION: kurang dari 4 section dipilih.
 * - PENDING_SECTIONS: 4 section dipilih tetapi ada yang belum GRADED.
 */
export function computeOverall(
  selectedSections: SimulationSection[],
  sectionResults: Array<{ section: SimulationSection; status: string; band: number | null }>,
): SimulationOverallResult {
  const selectedCount = selectedSections.length;
  const gradedSections = sectionResults.filter((s) => s.status === 'GRADED' && s.band !== null);

  let indicativeBand: number | null = null;
  if (gradedSections.length > 0) {
    indicativeBand = roundWeightedBand(
      gradedSections.map((s) => ({ weight: 1, band: s.band! })),
    );
  }

  if (selectedCount < 4) {
    return {
      status: 'PARTIAL_SELECTION',
      band: null,
      indicative_band: indicativeBand,
      label: `Overall parsial: dipilih ${selectedCount} dari 4 section`,
    };
  }

  // 4 section dipilih
  const allGraded = selectedSections.every((sec) => {
    const r = sectionResults.find((s) => s.section === sec);
    return r && r.status === 'GRADED' && r.band !== null;
  });

  if (allGraded) {
    const overallBand = roundWeightedBand(
      sectionResults.map((s) => ({ weight: 1, band: s.band! })),
    );
    return {
      status: 'COMPLETE',
      band: overallBand,
      indicative_band: overallBand,
      label: 'Overall',
    };
  }

  // 4 section dipilih tetapi pending
  const writingPending = sectionResults.find((s) => s.section === 'WRITING')?.status !== 'GRADED';
  const speakingPending = sectionResults.find((s) => s.section === 'SPEAKING')?.status !== 'GRADED';

  let label = 'Menunggu penilaian selesai';
  if (writingPending && speakingPending) {
    label = 'Menunggu penilaian Writing dan skor Speaking';
  } else if (writingPending) {
    label = 'Menunggu penilaian Writing';
  } else if (speakingPending) {
    label = 'Menunggu skor Speaking';
  }

  return {
    status: 'PENDING_SECTIONS',
    band: null,
    indicative_band: indicativeBand,
    label,
  };
}
