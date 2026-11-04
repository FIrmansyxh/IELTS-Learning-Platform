/**
 * Seed rubrik penilaian (SPEC-012/013). Deskriptor adalah parafrase singkat orisinal tingkat band 4-8,
 * BUKAN salinan verbatim deskriptor resmi (tugas konten C-05 di backlog akan mengganti/menyempurnakannya).
 */
export interface RubricCriterion {
  key: string;
  name: string;
  descriptors: Record<'4' | '5' | '6' | '7' | '8', string>;
}

export const WRITING_RUBRIC_V1: RubricCriterion[] = [
  {
    key: 'task_response',
    name: 'Task Response',
    descriptors: {
      '4': 'Menjawab soal sebagian saja; ide sedikit, kabur, atau tidak dikembangkan; posisi penulis sering tidak jelas.',
      '5': 'Menjawab soal secara terbatas; posisi kadang tidak konsisten; ide dikembangkan dangkal dengan sedikit contoh.',
      '6': 'Menjawab semua bagian soal walau tidak merata; posisi relevan; ide diperluas tetapi kadang kurang fokus atau kurang tuntas.',
      '7': 'Menjawab semua bagian soal; posisi jelas dan konsisten; ide utama diperluas dan didukung, dengan sedikit kelebihan atau kekurangan fokus.',
      '8': 'Menjawab semua bagian soal secara memadai dan tepat; ide dikembangkan baik dengan dukungan relevan; kelemahan hanya sesekali.',
    },
  },
  {
    key: 'coherence',
    name: 'Coherence & Cohesion',
    descriptors: {
      '4': 'Ide tersusun tanpa kemajuan jelas; penghubung terbatas, keliru, atau berulang; paragraf kurang terstruktur.',
      '5': 'Ada pengorganisasian tetapi tidak selalu logis; penghubung dipakai berlebihan atau kurang tepat; rujukan kadang membingungkan.',
      '6': 'Tersusun cukup rapi dengan alur yang dapat diikuti; penghubung efektif tetapi kadang kaku atau tidak akurat; paragraf tidak selalu terpusat.',
      '7': 'Informasi tersusun logis dengan kemajuan jelas; beragam penghubung dipakai cukup baik; paragraf umumnya terpusat pada satu gagasan.',
      '8': 'Urutan ide logis dan mudah diikuti; penghubung dan rujukan dikelola baik; paragraf diatur dengan tepat; kekeliruan jarang.',
    },
  },
  {
    key: 'lexical',
    name: 'Lexical Resource',
    descriptors: {
      '4': 'Kosakata terbatas dan sering berulang; salah pilih kata atau ejaan kerap mengganggu pemahaman.',
      '5': 'Kosakata cukup untuk tugas sederhana; upaya memakai kata kurang lazim sering keliru; kesalahan ejaan dan bentukan kata terasa.',
      '6': 'Kosakata memadai dan cukup bervariasi; mencoba kata kurang umum dengan beberapa kesalahan yang tidak menghalangi makna.',
      '7': 'Kosakata cukup luas dan fleksibel; memakai kata kurang umum dengan kesadaran kolokasi; masih ada kesalahan pilihan kata atau ejaan.',
      '8': 'Kosakata luas dan dipakai lancar serta tepat; kata kurang umum digunakan terampil; kesalahan jarang.',
    },
  },
  {
    key: 'grammar',
    name: 'Grammatical Range & Accuracy',
    descriptors: {
      '4': 'Struktur kalimat sangat terbatas; kalimat kompleks jarang dan sering salah; kesalahan tata bahasa dan tanda baca sering mengganggu.',
      '5': 'Ragam struktur terbatas; kalimat kompleks diusahakan tetapi sering salah; kesalahan cukup sering dan kadang mengganggu pemahaman.',
      '6': 'Campuran kalimat sederhana dan kompleks; kesalahan tata bahasa muncul tetapi jarang menghalangi pemahaman.',
      '7': 'Beragam struktur kompleks dipakai; banyak kalimat bebas kesalahan; masih ada beberapa kekeliruan tata bahasa atau tanda baca.',
      '8': 'Beragam struktur dipakai luwes; mayoritas kalimat bebas kesalahan; kekeliruan hanya sesekali atau karena kurang cermat.',
    },
  },
];

export const SPEAKING_RUBRIC_V1: RubricCriterion[] = [
  {
    key: 'fluency',
    name: 'Fluency & Coherence',
    descriptors: {
      '4': 'Sering berhenti lama dan mengulang; hanya mampu kalimat pendek; hubungan antar ide sulit diikuti.',
      '5': 'Berbicara dengan jeda dan pengulangan cukup sering; penghubung terbatas; kadang kehilangan alur pada topik rumit.',
      '6': 'Mau berbicara panjang walau kadang kehilangan alur karena mengulang atau ragu; memakai penghubung dengan variasi terbatas.',
      '7': 'Berbicara panjang tanpa upaya berlebihan; jeda biasanya terkait mencari isi, bukan bahasa; penghubung dipakai fleksibel.',
      '8': 'Mengalir lancar dengan jeda jarang; pengulangan atau koreksi diri sesekali; topik dikembangkan runtut dan tepat.',
    },
  },
  {
    key: 'lexical',
    name: 'Lexical Resource',
    descriptors: {
      '4': 'Kosakata cukup untuk topik akrab saja; salah pilih kata sering; sulit menjelaskan dengan kata lain.',
      '5': 'Dapat membahas topik akrab dan umum; mencoba parafrase dengan hasil beragam; kosakata terbatas pada topik asing.',
      '6': 'Kosakata cukup untuk membahas topik panjang walau tidak selalu tepat; parafrase umumnya berhasil.',
      '7': 'Memakai kosakata dengan fleksibel untuk beragam topik; sesekali memakai ungkapan idiomatik; parafrase efektif.',
      '8': 'Kosakata luas dan dipakai mudah serta tepat; ungkapan idiomatik kurang umum dipakai terampil walau kadang kurang pas.',
    },
  },
  {
    key: 'grammar',
    name: 'Grammatical Range & Accuracy',
    descriptors: {
      '4': 'Menghasilkan bentuk dasar dengan ketepatan wajar; kalimat kompleks hampir tidak ada; kesalahan sering dan mengganggu.',
      '5': 'Struktur sederhana cukup akurat; kalimat kompleks terbatas dan sering salah; kesalahan dapat menimbulkan salah paham.',
      '6': 'Campuran struktur sederhana dan kompleks dengan fleksibilitas terbatas; kesalahan ada tetapi jarang menghalangi makna.',
      '7': 'Beragam struktur kompleks dipakai cukup fleksibel; sering menghasilkan kalimat bebas kesalahan; masih ada kekeliruan.',
      '8': 'Beragam struktur dipakai luwes; mayoritas kalimat bebas kesalahan; kekeliruan sesekali dan tidak sistematis.',
    },
  },
  {
    key: 'pronunciation',
    name: 'Pronunciation',
    descriptors: {
      '4': 'Bunyi terbatas; pola tekanan dan intonasi sedikit; sering sulit dipahami meski pendengar berusaha.',
      '5': 'Ciri pelafalan dipakai sebagian tetapi tidak konsisten; salah ucap kata membuat pendengar kadang perlu berusaha.',
      '6': 'Ciri pelafalan dipakai dengan kendali bervariasi; secara umum dapat dipahami walau ada kata yang keliru diucapkan.',
      '7': 'Menunjukkan sebagian besar ciri pelafalan tingkat 6 dan beberapa tingkat 8; mudah dipahami sepanjang bicara.',
      '8': 'Beragam ciri pelafalan dipakai dengan nuansa; mudah dipahami sepanjang bicara; pengaruh bahasa ibu kecil.',
    },
  },
];
