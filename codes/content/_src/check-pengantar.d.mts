/** Deklarasi tipe untuk check-pengantar.mjs (dipakai tests/unit/content-articles.test.tsx). */
export declare const INTRO_HEADING: string;
export declare const INTRO_LABELS: string[];
export declare const TERMS_HEADING: string;
export declare const LEAD_MIN_WORDS: number;
/** Mengembalikan daftar pelanggaran standar Pengantar Dasar Materi (kosong = lolos). */
export declare function checkPengantar(markdown: string): string[];
