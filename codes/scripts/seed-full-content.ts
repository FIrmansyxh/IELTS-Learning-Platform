import './_env';
import { eq, sql } from 'drizzle-orm';
import { getDb, closeDb } from '../src/server/db';
import {
  modules,
  subModules,
  learningMaterials,
  assessmentSets,
  contentSources,
  users,
  userSubModuleProgress,
} from '../src/db/schema';
import { recomputeStatuses } from '../src/server/gatekeeping/service';

// Pembangun pertanyaan
const mcq = (id: string, skill: any, prompt: string, options: string[], answer: string, explanation_id: string) => ({
  question_id: id, question_type: 'MCQ_SINGLE', skill, prompt, options, correct_answers: [answer], explanation_id, points: 1,
});
const fill = (id: string, skill: any, prompt: string, answers: string[], explanation_id: string, max_words = 2) => ({
  question_id: id, question_type: 'FILL_IN_BLANK', skill, prompt, correct_answers: answers, explanation_id, max_words, points: 1,
});
const shortAns = (id: string, skill: any, prompt: string, answers: string[], explanation_id: string, max_words = 2) => ({
  question_id: id, question_type: 'SHORT_ANSWER', skill, prompt, correct_answers: answers, explanation_id, max_words, points: 1,
});

async function main() {
  const db = getDb();
  console.log('[seed-full-content] Memulai pengisian modul materi & 3 paket soal...');

  // 1. Ambil source id OWN
  const [ownSource] = await db.select({ id: contentSources.id }).from(contentSources).where(eq(contentSources.code, 'OWN')).limit(1);
  const sourceId = ownSource?.id;

  // 2. Data materi komprehensif & 3 paket soal untuk Tier 1
  const tier1Data = [
    {
      code: '1.1.1',
      title: 'Nouns, Pronouns, Articles (a/an/the), & Plurals',
      article: `# Nouns, Pronouns, Articles (a/an/the), & Plurals dalam IELTS

Penggunaan kata benda (*nouns*), kata ganti (*pronouns*), dan artikel (*articles*) yang tepat merupakan pondasi utama dalam kriteria penilaian **Grammatical Range and Accuracy** pada tes IELTS Writing dan Speaking.

## 1. Singular, Plural, and Uncountable Nouns
Dalam bahasa Inggris akademik, kesalahan kesesuaian antara kata benda dan kata kerja (*subject-verb agreement*) sering kali menurunkan skor ke Band 5.0.

- **Countable Nouns (Dapat Dihitung):** Memiliki bentuk tunggal dan jamak.
  - *Contoh:* *a student* $\\rightarrow$ *students*, *an analysis* $\\rightarrow$ *analyses*, *a phenomenon* $\\rightarrow$ *phenomena*.
- **Uncountable Nouns (Tidak Dapat Dihitung):** Tidak pernah menggunakan akhiran *-s* dan tidak dapat didahului langsung oleh angka atau artikel *a/an*.
  - *Kata krusial dalam IELTS:* **information**, **advice**, **equipment**, **research**, **traffic**, **pollution**, **accommodation**, **baggage**.
  - *Salah:* *The researcher gave many advices.*
  - *Benar:* *The researcher gave valuable advice* atau *several pieces of advice.*

## 2. Aturan Penggunaan Artikel: A, An, vs. The
- **A / An (Indefinite Article):** Digunakan untuk kata benda tunggal yang dapat dihitung ketika pertama kali diperkenalkan atau bersifat umum.
  - *a university* (bunyi konsonan /juː/), *an hour* (bunyi vokal /aʊər/).
- **The (Definite Article):** Digunakan ketika pembaca dan penulis sama-sama mengetahui benda spesifik yang dirujuk.
  - Sesuatu yang unik di dunia: *the environment*, *the internet*, *the sun*.
  - Penyebutan kedua kali: *A survey was conducted. The survey revealed...*
  - Bentuk superlatif dan angka urutan: *the most important factor*, *the first step*.
  - Nama negara federasi atau kepulauan: *the United Kingdom*, *the United States*, *the Netherlands*.
- **Zero Article (Tanpa Artikel):**
  - Kata benda jamak atau tak terhitung yang bermakna umum: *Education plays a vital role.* (Bukan *The education*).

## 3. Pronoun Referencing & Academic Consistency
Gunakan kata ganti (*it, they, this, these*) untuk menjaga kohesi tulisan tanpa mengulang kata benda yang sama berulang-ulang (*lexical cohesion*). Pastikan rujukan pronoun jelas dan tidak ambigu.`,
      miniPrompt: 'Tulis 3 kalimat akademik yang menjelaskan peran pendidikan bagi generasi muda, dengan menggunakan: (1) satu kata benda tak terhitung (mis. education/knowledge), (2) artikel "the" untuk hal unik, dan (3) pronoun "they/it" yang rujukannya jelas.',
      drillQuestions: [
        // Paket 1 (10 soal)
        fill('Q-111-P1-01', 'GRAMMAR', "Lengkapi dengan artikel yang tepat ('a', 'an', atau 'the'):\n'Global warming is widely considered to be _______ most urgent threat.'", ['the'], "Gunakan 'the' sebelum bentuk superlatif 'most urgent'."),
        fill('Q-111-P1-02', 'GRAMMAR', "Pilih bentuk kata benda yang tepat:\n'The university conducted extensive _______ (research / researches) into renewable fuels.'", ['research'], "'Research' adalah kata benda tak terhitung (uncountable) dalam bahasa Inggris akademik."),
        fill('Q-111-P1-03', 'GRAMMAR', "Lengkapi dengan artikel yang benar:\n'It takes approximately _______ hour to complete the examination.'", ['an'], "Kata 'hour' diawali dengan bunyi vokal /aʊər/, sehingga memakai 'an'."),
        mcq('Q-111-P1-04', 'GRAMMAR', "Manakah kalimat dengan penggunaan artikel dan plural yang sepenuhnya benar?",
          ['The government should invest in public transportations.', 'The government should invest in public transportation.', 'Government should invest in a public transportations.', 'A government should invest in public transportations.'],
          'The government should invest in public transportation.', "Transportation bersifat uncountable."),
        mcq('Q-111-P1-05', 'GRAMMAR', "Pilih pronoun yang tepat untuk melengkapi rujukan kalimat:\n'The committee published _______ annual report yesterday.'",
          ['its', 'their', 'his', 'our'], 'its', "Subjek 'the committee' di sini dirujuk sebagai satu kesatuan tunggal institusi: 'its'."),
        mcq('Q-111-P1-06', 'GRAMMAR', "Pada kalimat manakah kata 'information' digunakan dengan benar?",
          ['Many informations were provided.', 'Much information was provided.', 'An information was provided.', 'Several informations were provided.'],
          'Much information was provided.', "Information tak terhitung, sehingga dipasangkan dengan 'much' dan kata kerja tunggal 'was'."),
        fill('Q-111-P1-07', 'GRAMMAR', "Bentuk jamak tidak beraturan dari kata 'criterion' adalah _______.", ['criteria'], "Bentuk jamak akademik dari 'criterion' adalah 'criteria'."),
        fill('Q-111-P1-08', 'GRAMMAR', "Lengkapi artikel yang tepat:\n'_______ United Kingdom has experienced significant demographic shifts.'", ['The', 'the'], "Nama negara berupa persemakmuran/kerajaan memakai artikel 'The'."),
        mcq('Q-111-P1-09', 'GRAMMAR', "Pilih kata ganti penunjuk yang tepat:\n'_______ findings suggest that further empirical investigation is warranted.'",
          ['These', 'This', 'That', 'An'], 'These', "Kata 'findings' berbentuk jamak sehingga memakai 'These'."),
        shortAns('Q-111-P1-10', 'GRAMMAR', "Tulis bentuk tunggal dari kata benda 'phenomena' (SATU kata).", ['phenomenon'], "Tunggal dari phenomena adalah phenomenon.", 1),

        // Paket 2 (10 soal variasi)
        fill('Q-111-P2-01', 'GRAMMAR', "Lengkapi dengan artikel yang tepat:\n'Mount Everest is _______ highest mountain on Earth.'", ['the'], "Bentuk superlatif 'highest' memerlukan artikel 'the'."),
        fill('Q-111-P2-02', 'GRAMMAR', "Pilih bentuk yang tepat:\n'Modern laboratories require sophisticated _______ (equipment / equipments).' ", ['equipment'], "'Equipment' adalah kata benda tak terhitung (uncountable)."),
        fill('Q-111-P2-03', 'GRAMMAR', "Lengkapi artikel:\n'The institution offers _______ unique opportunity for international scholars.'", ['a'], "'Unique' diawali bunyi konsonan /juː/, jadi memakai 'a' bukan 'an'."),
        mcq('Q-111-P2-04', 'GRAMMAR', "Manakah kalimat akademik yang benar mengenai lalu lintas perkotaan?",
          ['There was heavy traffic on the motorway.', 'There were heavy traffics on the motorway.', 'There was a heavy traffic on the motorway.', 'There were many traffics on the motorway.'],
          'There was heavy traffic on the motorway.', "'Traffic' tidak dapat dihitung dan memakai 'was'."),
        mcq('Q-111-P2-05', 'GRAMMAR', "Pilih pronoun rujukan yang tepat:\n'The department announced that _______ will inaugurate the new lecture hall next week.'",
          ['it', 'they', 'him', 'whose'], 'it', "Rujukan departemen tunggal memakai 'it'."),
        mcq('Q-111-P2-06', 'GRAMMAR', "Manakah penggunaan frasa kuantitas yang benar untuk 'advice'?",
          ['Three advices', 'Three pieces of advice', 'Three advice', 'An advice'],
          'Three pieces of advice', "Kata tak terhitung diukur dengan partitive noun 'pieces of advice'."),
        fill('Q-111-P2-07', 'GRAMMAR', "Bentuk jamak akademik dari kata 'analysis' adalah _______.", ['analyses'], "Analysis (tunggal) menjadi analyses (jamak)."),
        fill('Q-111-P2-08', 'GRAMMAR', "Lengkapi artikel yang tepat:\n'Delegates traveled to _______ United States for the trade conference.'", ['the', 'The'], "Nama negara 'United States' memerlukan 'the'."),
        mcq('Q-111-P2-09', 'GRAMMAR', "Pilih demonstrative pronoun yang tepat:\n'_______ hypothesis requires further laboratory testing.'",
          ['This', 'These', 'Those', 'Many'], 'This', "Hypothesis tunggal memakai 'This'."),
        shortAns('Q-111-P2-10', 'GRAMMAR', "Tulis bentuk tunggal dari kata benda 'hypotheses' (SATU kata).", ['hypothesis'], "Bentuk tunggal: hypothesis.", 1),

        // Paket 3 (10 soal variasi)
        fill('Q-111-P3-01', 'GRAMMAR', "Lengkapi artikel:\n'Solar power is _______ fastest growing renewable energy source.'", ['the'], "Superlatif 'fastest' memerlukan 'the'."),
        fill('Q-111-P3-02', 'GRAMMAR', "Lengkapi kata benda:\n'The travelers carried minimal _______ (luggage / luggages).' ", ['luggage'], "'Luggage' adalah uncountable noun."),
        fill('Q-111-P3-03', 'GRAMMAR', "Lengkapi artikel:\n'The applicant holds _______ master degree in economics.'", ['a'], "Master degree tunggal konsonan diawali 'a'."),
        mcq('Q-111-P3-04', 'GRAMMAR', "Manakah kalimat akademik yang benar tentang polusi lingkungan?",
          ['Air pollution affects metropolitan regions globally.', 'Air pollutions affect metropolitan regions globally.', 'An air pollution affects regions globally.', 'Many air pollutions affect regions.'],
          'Air pollution affects metropolitan regions globally.', "Pollution tak terhitung."),
        mcq('Q-111-P3-05', 'GRAMMAR', "Pilih kata ganti yang tepat:\n'The organization achieved all _______ quarterly targets.'",
          ['its', 'their', 'his', 'her'], 'its', "Organisasi tunggal memakai 'its'."),
        mcq('Q-111-P3-06', 'GRAMMAR', "Pilih penggunaan partitive noun yang tepat untuk kata benda tak terhitung:",
          ['An item of information', 'An information', 'Informations', 'Many information'],
          'An item of information', "Partitive noun 'item of information' adalah penggunaan baku."),
        fill('Q-111-P3-07', 'GRAMMAR', "Bentuk jamak tidak beraturan dari kata 'crisis' adalah _______.", ['crises'], "Bentuk jamak dari crisis adalah crises."),
        fill('Q-111-P3-08', 'GRAMMAR', "Lengkapi artikel:\n'The summit was hosted in _______ Netherlands.'", ['the', 'The'], "Negara 'Netherlands' memerlukan 'the'."),
        mcq('Q-111-P3-09', 'GRAMMAR', "Pilih determiner yang tepat:\n'_______ data demonstrates a consistent upward trajectory.'",
          ['This', 'These', 'Those', 'Many'], 'This', "Dalam konteks sains modern, 'This data' umum digunakan."),
        shortAns('Q-111-P3-10', 'GRAMMAR', "Tulis bentuk tunggal dari kata benda 'bacteria' (SATU kata).", ['bacterium'], "Tunggal dari bacteria adalah bacterium.", 1),
      ],
    },
    {
      code: '1.1.2',
      title: 'Present Simple vs. Present Continuous',
      article: `# Present Simple vs. Present Continuous dalam IELTS

Membedakan kapan harus menggunakan **Present Simple** dan **Present Continuous** adalah kunci utama dalam menggambarkan grafik tren (Writing Task 1) dan mengemukakan opini serta kebiasaan (Speaking Part 1 & 2).

## 1. Present Simple: Fakta Umum, Kebiasaan, dan Tren Permanen
Gunakan Present Simple untuk:
- Fakta ilmiah umum atau kebenaran universal:
  - *Water boils at 100 degrees Celsius.*
  - *Economic growth depends on innovation.*
- Rutinitas dan kebiasaan berulang:
  - *Most commuters travel by underground train every day.*
- Kondisi permanen atau jangka panjang:
  - *The chart illustrates the consumption of fossil fuels between 2000 and 2020.* (Bahasa deskripsi diagram selalu Present Simple!).

## 2. Present Continuous: Tren Berjalan & Situasi Sementara
Gunakan Present Continuous (*am/is/are + verb-ing*) untuk:
- Peristiwa atau proses yang sedang berlangsung saat ini:
  - *Global temperatures are rising at an alarming rate.*
- Perubahan dan perkembangan bertahap (*gradual changes*):
  - *The population of urban areas is expanding rapidly.*
  - *Renewable energy technologies are becoming more affordable.*

## 3. Stative Verbs (Kata Kerja Keadaan)
Beberapa kata kerja **tidak boleh** digunakan dalam bentuk continuous karena menggambarkan keadaan, bukan aktivitas fisik:
- Perasaan/pikiran: *believe, know, understand, prefer, remember, recognize*.
- Kepemilikan: *belong, possess, own*.
- Indera/tampilan: *seem, appear, resemble*.
- *Salah:* *I am believing that education should be free.*
- *Benar:* *I believe that education should be free.*`,
      miniPrompt: 'Tulis perbandingan 2 kalimat: (1) satu kalimat Present Simple tentang fakta umum transportasi umum, dan (2) satu kalimat Present Continuous tentang tren adopsi kendaraan listrik yang sedang berlangsung saat ini.',
      drillQuestions: [
        fill('Q-112-P1-01', 'GRAMMAR', "Lengkapi dengan Present Simple dari kata di dalam kurung:\n'The line graph _______ (show) the proportion of graduates employed in 2020.'", ['shows'], "Deskripsi grafik selalu memakai Present Simple tunggal 'shows'."),
        fill('Q-112-P1-02', 'GRAMMAR', "Lengkapi dengan Present Continuous:\n'At present, average global temperatures _______ (rise) steadily.'", ['are rising'], "Subjek 'temperatures' jamak memakai 'are rising'."),
        mcq('Q-112-P1-03', 'GRAMMAR', "Pilih kalimat yang benar dengan stative verb:",
          ['I am understanding the lecture completely.', 'I understand the lecture completely.', 'I am understand the lecture.', 'I understands the lecture.'],
          'I understand the lecture completely.', "'Understand' adalah stative verb yang tidak memakai continuous."),
        mcq('Q-112-P1-04', 'GRAMMAR', "Manakah kalimat yang menyatakan fakta permanen?",
          ['Plants absorb carbon dioxide during photosynthesis.', 'Plants are absorbing carbon dioxide today.', 'Plants is absorbing carbon dioxide.', 'Plants absorbs carbon dioxide.'],
          'Plants absorb carbon dioxide during photosynthesis.', "Fakta biologi ilmiah menggunakan Present Simple."),
        fill('Q-112-P1-05', 'GRAMMAR', "Lengkapi kalimat:\n'More consumers _______ (choose) plant-based alternatives nowadays.'", ['are choosing'], "Perubahan tren masa kini memakai Present Continuous."),

        fill('Q-112-P2-01', 'GRAMMAR', "Lengkapi dengan Present Simple:\n'The diagram _______ (illustrate) the stages of paper recycling.'", ['illustrates'], "Diagram ilustrates (tunggal)."),
        fill('Q-112-P2-02', 'GRAMMAR', "Lengkapi dengan Present Continuous:\n'Worldwide internet usage _______ (increase) year on year.'", ['is increasing'], "Subjek 'usage' tunggal memakai 'is increasing'."),
        mcq('Q-112-P2-03', 'GRAMMAR', "Pilih kalimat yang tepat untuk menyatakan keyakinan akademik:",
          ['Many researchers believe that diet affects longevity.', 'Many researchers are believing that diet affects longevity.', 'Researchers is believing diet affects health.', 'Researchers believes diet affects health.'],
          'Many researchers believe that diet affects longevity.', "Stative verb 'believe' berbentuk simple."),
        mcq('Q-112-P2-04', 'GRAMMAR', "Manakah kalimat yang tepat untuk perubahan tren yang sedang berlangsung?",
          ['Renewable technologies are becoming more affordable.', 'Renewable technologies become more affordable right now.', 'Renewable technologies is becoming affordable.', 'Renewable technologies becomes affordable.'],
          'Renewable technologies are becoming more affordable.', "Perubahan dinamis 'are becoming'."),
        fill('Q-112-P2-05', 'GRAMMAR', "Lengkapi bentuk Present Simple:\n'The human heart _______ (pump) blood throughout the body.'", ['pumps'], "Fakta biologis: subjek tunggal 'pumps'."),

        fill('Q-112-P3-01', 'GRAMMAR', "Lengkapi Present Simple:\n'The bar chart _______ (compare) expenditure across four countries.'", ['compares'], "Present Simple: compares."),
        fill('Q-112-P3-02', 'GRAMMAR', "Lengkapi Present Continuous:\n'Coastal cities _______ (face) growing flood risks due to sea level rise.'", ['are facing'], "Kondisi berkembang saat ini: 'are facing'."),
        mcq('Q-112-P3-03', 'GRAMMAR', "Pilih kalimat yang benar dengan kata kepemilikan (possession):",
          ['The university possesses extensive archival collections.', 'The university is possessing extensive collections.', 'The university possess extensive collections.', 'The university are possessing collections.'],
          'The university possesses extensive archival collections.', "'Possess' adalah stative verb."),
        mcq('Q-112-P3-04', 'GRAMMAR', "Pilih kalimat yang paling tepat untuk tren masa kini dalam Writing Task 1:",
          ['The percentage of remote workers is rising continuously.', 'The percentage of remote workers rises right now.', 'The percentage rise continuously.', 'The percentage are rising continuously.'],
          'The percentage of remote workers is rising continuously.', "Subjek 'The percentage' tunggal memakai 'is rising'."),
        fill('Q-112-P3-05', 'GRAMMAR', "Lengkapi Present Simple:\n'Gravity _______ (pull) objects toward the center of the Earth.'", ['pulls'], "Hukum fisika universal: pulls."),
      ],
    },
    {
      code: '1.1.3',
      title: 'Past Simple vs. Present Perfect',
      article: `# Past Simple vs. Present Perfect dalam IELTS

Kemampuan membedakan **Past Simple** dan **Present Perfect** sangat esensial saat menyajikan data historis pada IELTS Writing Task 1 dan menceritakan pengalaman pribadi di IELTS Speaking Part 2.

## 1. Past Simple: Waktu Tertentu yang Telah Selesai di Masa Lampau
Gunakan Past Simple saat ada keterangan waktu lampau yang jelas dan periode waktu tersebut sudah berakhir:
- Keterangan waktu: *in 2010, yesterday, five years ago, during the 1990s, between 2005 and 2015*.
  - *Sales reached a peak of 500 units in 2015.*
  - *The government introduced new environmental regulations last year.*

## 2. Present Perfect: Pengalaman, Hasil Relevan Sekarang, & Waktu Belum Berakhir
Gunakan Present Perfect (*has/have + Past Participle / V3*) saat:
- Waktu kejadian tidak disebutkan secara spesifik (yang dipentingkan adalah hasilnya saat ini):
  - *Scientists have discovered substantial evidence of climate change.*
- Dimulai di masa lampau dan masih berlanjut hingga saat ini:
  - *Urbanization has accelerated since the turn of the century.*
- Dengan penanda waktu: *since, for the past decade, recently, so far, over the last few years*.
  - *Over the last ten years, renewable energy has expanded significantly.*

## 3. Kesalahan Umum Peserta IELTS
- *Salah:* *In 2018, the figure has increased by 15%.*
- *Benar:* *In 2018, the figure increased by 15%.* (Ada tahun lampau spesifik $\\rightarrow$ wajib Past Simple!).`,
      miniPrompt: 'Tulis 2 kalimat: (1) satu kalimat Past Simple dengan tahun spesifik (mis. in 2015), dan (2) satu kalimat Present Perfect dengan frasa "Since 2020" untuk menjelaskan perubahan teknologi.',
      drillQuestions: [
        fill('Q-113-P1-01', 'GRAMMAR', "Lengkapi dengan bentuk Past Simple:\n'In 2010, the company _______ (open) its first overseas branch.'", ['opened'], "Keterangan tahun spesifik 'In 2010' memerlukan Past Simple 'opened'."),
        fill('Q-113-P1-02', 'GRAMMAR', "Lengkapi dengan Present Perfect:\n'Since 2015, renewable energy consumption _______ (grow) by 40 percent.'", ['has grown'], "'Since 2015' menandakan Present Perfect: 'has grown'."),
        mcq('Q-113-P1-03', 'GRAMMAR', "Manakah kalimat yang menggunakan tense dengan benar?",
          ['The unemployment rate fell sharply in 2018.', 'The unemployment rate has fallen sharply in 2018.', 'The unemployment rate fall sharply in 2018.', 'The unemployment rate is falling in 2018.'],
          'The unemployment rate fell sharply in 2018.', "Tahun 'in 2018' wajib Past Simple 'fell'."),
        mcq('Q-113-P1-04', 'GRAMMAR', "Pilih bentuk yang tepat untuk rentang waktu yang masih berlanjut hingga sekarang:\n'Over the past decade, internet connectivity _______ worldwide.'",
          ['has improved', 'improved', 'improves', 'had improved'], 'has improved', "'Over the past decade' memerlukan Present Perfect."),
        fill('Q-113-P1-05', 'GRAMMAR', "Lengkapi dengan Past Simple:\n'Between 2000 and 2005, the population _______ (increase) by 12%.'", ['increased'], "Periode waktu tertutup memerlukan Past Simple."),

        fill('Q-113-P2-01', 'GRAMMAR', "Lengkapi dengan Past Simple:\n'Archaeologists _______ (discover) the ancient ruins last summer.'", ['discovered'], "'Last summer' menandakan Past Simple: discovered."),
        fill('Q-113-P2-02', 'GRAMMAR', "Lengkapi Present Perfect:\n'Urban infrastructure _______ (expand) significantly over recent years.'", ['has expanded'], "'Over recent years' memerlukan Present Perfect."),
        mcq('Q-113-P2-03', 'GRAMMAR', "Pilih kalimat yang benar:",
          ['The treaty was signed in 1995.', 'The treaty has been signed in 1995.', 'The treaty is signed in 1995.', 'The treaty sign in 1995.'],
          'The treaty was signed in 1995.', "Tahun lampau 1995 memerlukan Past Simple pasif: was signed."),
        mcq('Q-113-P2-04', 'GRAMMAR', "Pilih tense yang tepat:\n'So far, three clinical trials _______ positive results.'",
          ['have yielded', 'yielded', 'yields', 'had yielded'], 'have yielded', "'So far' berpasangan dengan Present Perfect."),
        fill('Q-113-P2-05', 'GRAMMAR', "Lengkapi Past Simple:\n'The economy _______ (contract) during the 2008 financial crisis.'", ['contracted'], "Waktu krisis 2008 yang lampau: contracted."),

        fill('Q-113-P3-01', 'GRAMMAR', "Lengkapi Past Simple:\n'The museum _______ (launch) the special exhibition two months ago.'", ['launched'], "'Two months ago' memerlukan Past Simple: launched."),
        fill('Q-113-P3-02', 'GRAMMAR', "Lengkapi Present Perfect:\n'Scientists _______ (publish) numerous papers on genetic sequencing recently.'", ['have published'], "'Recently' dengan subjek jamak: have published."),
        mcq('Q-113-P3-03', 'GRAMMAR', "Manakah kalimat yang akurat untuk laporan data Task 1?",
          ['Vehicle production peaked at 2 million units in 2012.', 'Vehicle production has peaked at 2 million units in 2012.', 'Vehicle production peaks in 2012.', 'Vehicle production had peaked in 2012.'],
          'Vehicle production peaked at 2 million units in 2012.', "Tahun 2012: peaked."),
        mcq('Q-113-P3-04', 'GRAMMAR', "Pilih bentuk kata kerja yang tepat:\n'Since its establishment, the charity _______ thousands of families.'",
          ['has assisted', 'assisted', 'assists', 'had assisted'], 'has assisted', "'Since its establishment' memerlukan Present Perfect."),
        fill('Q-113-P3-05', 'GRAMMAR', "Lengkapi Past Simple:\n'Oil prices _______ (drop) significantly in March 2020.'", ['dropped'], "Maret 2020: dropped."),
      ],
    },
    {
      code: '1.1.4',
      title: 'Modals of Ability, Obligation & Possibility (can, must, should, might)',
      article: `# Modals of Ability, Obligation & Possibility dalam IELTS

Penggunaan *Modal Verbs* (*can, could, must, should, might, may*) memberikan nuansa kesopanan, ketegasan, dan *hedging* (pembatasan klaim akademik) yang sangat dihargai dalam penilaian IELTS Writing Task 2 dan Speaking Part 3.

## 1. Modals of Ability & Possibility (*Hedging*)
Penulis akademik yang baik tidak membuat klaim mutlak seperti *"Poverty causes crime"*. Sebaliknya, mereka menggunakan modal untuk menyajikan argumen yang terukur:
- **May / Might / Could (Kemungkinan & Hedging):**
  - *Investing in early childhood education **may lead** to lower crime rates in the long run.*
  - *Excessive screen time **might impair** children cognitive development.*
- **Can / Could (Kemampuan):**
  - *Technological solutions **can enhance** agricultural productivity.*

## 2. Modals of Obligation & Recommendation
- **Should / Ought to (Rekomendasi Kuat & Solusi):**
  - Digunakan saat menyusun paragraf solusi atau rekomendasi kebijakan:
  - *Governments **should implement** stricter carbon emission caps.*
  - *Schools **ought to teach** financial literacy to adolescent students.*
- **Must / Have to (Kewajiban Mutlak):**
  - *Drivers **must adhere** to road safety regulations to prevent fatalities.*

## 3. Struktur Gramatikal Modal
Modal selalu diikuti oleh kata kerja bentuk dasar (*bare infinitive* / V1 tanpa *to*):
- *Modal + Verb 1* (Aktif) $\\rightarrow$ *Students **must submit** the application.*
- *Modal + be + Verb 3* (Pasif) $\\rightarrow$ *The application **must be submitted**.*`,
      miniPrompt: 'Tulis 2 kalimat solusi untuk masalah polusi udara di kota besar dengan menggunakan modal "should" (rekomendasi) dan "could" (kemungkinan dampak positif).',
      drillQuestions: [
        fill('Q-114-P1-01', 'GRAMMAR', "Lengkapi dengan kata kerja dasar yang benar setelah modal:\n'The municipal council must _______ (enforce) stricter recycling laws.'", ['enforce'], "Setelah modal 'must', kata kerja berbentuk dasar: 'enforce'."),
        fill('Q-114-P1-02', 'GRAMMAR', "Lengkapi bentuk pasif modal:\n'Urgent measures should _______ (take) to mitigate deforestation.'", ['be taken'], "Pasif modal: should + be + V3 -> 'be taken'."),
        mcq('Q-114-P1-03', 'GRAMMAR', "Manakah kalimat yang menggunakan teknik hedging (pembatasan klaim) yang paling tepat untuk esai akademik?",
          ['Smoking definitely destroys all human organs immediately.', 'Smoking can lead to severe cardiovascular disorders.', 'Smoking will always kill everyone who tries it.', 'Smoking must be destructive.'],
          'Smoking can lead to severe cardiovascular disorders.', "'Can lead to' menyajikan klaim ilmiah yang terukur dan objektif."),
        mcq('Q-114-P1-04', 'GRAMMAR', "Pilih modal yang paling sesuai untuk rekomendasi kebijakan publik:",
          ['Governments should subsidize public transit systems.', 'Governments might to subsidize public transit systems.', 'Governments can to subsidize public transit systems.', 'Governments should to subsidize public transit systems.'],
          'Governments should subsidize public transit systems.', "'Should' diikuti bare infinitive."),
        fill('Q-114-P1-05', 'GRAMMAR', "Lengkapi kalimat:\n'Early diagnosis might _______ (save) thousands of patient lives.'", ['save'], "Modal 'might' diikuti bare verb 'save'."),

        fill('Q-114-P2-01', 'GRAMMAR', "Lengkapi bentuk kata kerja dasar:\n'Individuals can _______ (reduce) their carbon footprint through daily habits.'", ['reduce'], "Can + reduce."),
        fill('Q-114-P2-02', 'GRAMMAR', "Lengkapi bentuk pasif modal:\n'Hazardous waste must _______ (dispose) of according to strict safety protocols.'", ['be disposed'], "Must + be disposed."),
        mcq('Q-114-P2-03', 'GRAMMAR', "Pilih kalimat dengan rekomendasi akademik yang tepat:",
          ['Educators should encourage critical thinking skills.', 'Educators must to encourage critical thinking.', 'Educators should to encourage critical thinking.', 'Educators ought encourage critical thinking.'],
          'Educators should encourage critical thinking skills.', "Should encourage."),
        mcq('Q-114-P2-04', 'GRAMMAR', "Pilih kalimat dengan modal kemungkinan (possibility):",
          ['Adopting renewable energy could significantly decrease pollution levels.', 'Adopting renewable energy could to decrease pollution.', 'Adopting renewable energy must decrease pollution always.', 'Adopting renewable energy can decreasing pollution.'],
          'Adopting renewable energy could significantly decrease pollution levels.', "Could decrease."),
        fill('Q-114-P2-05', 'GRAMMAR', "Lengkapi kalimat:\n'Technological advances may _______ (create) novel employment sectors.'", ['create'], "May + create."),

        fill('Q-114-P3-01', 'GRAMMAR', "Lengkapi kata kerja:\n'Students ought to _______ (verify) source citations before submission.'", ['verify'], "Ought to + verify."),
        fill('Q-114-P3-02', 'GRAMMAR', "Lengkapi pasif modal:\n'Public funds should _______ (allocate) to primary healthcare centers.'", ['be allocated'], "Should + be allocated."),
        mcq('Q-114-P3-03', 'GRAMMAR', "Manakah kalimat hedging yang paling sesuai untuk kesimpulan esai Task 2?",
          ['These strategic investments may foster long-term economic resilience.', 'These strategic investments will definitely solve all economic problems.', 'These strategic investments must to foster growth.', 'These investments can fostering resilience.'],
          'These strategic investments may foster long-term economic resilience.', "May foster."),
        mcq('Q-114-P3-04', 'GRAMMAR', "Pilih modal yang tepat untuk kewajiban hukum:",
          ['Motorists must obey speed limits on highways.', 'Motorists might obey speed limits on highways.', 'Motorists should to obey speed limits.', 'Motorists can to obey speed limits.'],
          'Motorists must obey speed limits on highways.', "Must obey."),
        fill('Q-114-P3-05', 'GRAMMAR', "Lengkapi kata kerja:\n'Artificial intelligence might _______ (transform) conventional diagnostics.'", ['transform'], "Might + transform."),
      ],
    },
  ];

  for (const item of tier1Data) {
    const [sub] = await db.select().from(subModules).where(eq(subModules.subModuleCode, item.code)).limit(1);
    if (!sub) continue;

    // 1. Insert or update learning_materials
    await db
      .insert(learningMaterials)
      .values({
        subModuleId: sub.id,
        articleMarkdown: item.article,
        origin: 'AI_GENERATED_REVIEWED',
        sourceId,
        attributionText: 'Materi orisinal IELTS Learning Platform',
        miniTaskJson: {
          task_type: 'AI_SHORT_WRITING',
          prompt: item.miniPrompt,
          ai_rubric_criteria: 'Kesesuaian topik, akurasi tata bahasa, dan penguasaan pola kalimat.',
        },
      })
      .onConflictDoUpdate({
        target: learningMaterials.subModuleId,
        set: {
          articleMarkdown: item.article,
          miniTaskJson: {
            task_type: 'AI_SHORT_WRITING',
            prompt: item.miniPrompt,
            ai_rubric_criteria: 'Kesesuaian topik, akurasi tata bahasa, dan penguasaan pola kalimat.',
          },
        },
      });

    // 2. Insert or update Active Drill assessment_sets
    const [existingSet] = await db
      .select({ id: assessmentSets.id })
      .from(assessmentSets)
      .where(sql`${assessmentSets.subModuleId} = ${sub.id} AND ${assessmentSets.assessmentType} = 'ACTIVE_DRILL'`)
      .limit(1);

    if (!existingSet) {
      await db.insert(assessmentSets).values({
        assessmentType: 'ACTIVE_DRILL',
        title: `Active Drill: ${item.title}`,
        subModuleId: sub.id,
        timeLimitSeconds: 600,
        passPercent: 75,
        origin: 'AI_GENERATED_REVIEWED',
        sourceId,
        attributionText: 'Latihan soal variasi IELTS Learning Platform',
        status: 'PUBLISHED',
        questionsJson: item.drillQuestions as any,
        questionCount: item.drillQuestions.length,
      });
    } else {
      await db.update(assessmentSets).set({
        title: `Active Drill: ${item.title}`,
        questionsJson: item.drillQuestions as any,
        questionCount: item.drillQuestions.length,
        status: 'PUBLISHED',
      }).where(eq(assessmentSets.id, existingSet.id));
    }

    console.log(`[seed-full-content] Sub-modul ${item.code} (${item.title}) materi & drill berhasil disemai.`);
  }

  // 3. Publikasikan SEMUA modul dan sub-modul yang sudah siap
  console.log('[seed-full-content] Mempublikasikan status modul & sub-modul...');
  await db.update(modules).set({ status: 'PUBLISHED' });
  await db.update(subModules).set({ status: 'PUBLISHED' });
  await db.update(assessmentSets).set({ status: 'PUBLISHED' });

  // 4. Hitung ulang progres untuk semua user (termasuk learner & admin)
  console.log('[seed-full-content] Menghitung ulang unlocking status (recomputeStatuses)...');
  const allUsers = await db.select({ id: users.id, email: users.email }).from(users);
  for (const u of allUsers) {
    await recomputeStatuses(db, u.id);
    console.log(`[seed-full-content] Status progres diperbarui untuk: ${u.email}`);
  }

  console.log('[seed-full-content] SELESAI! Seluruh sub-modul Tier 1 aktif dan siap dipelajari.');
  await closeDb();
}

main().catch((err) => {
  console.error('[seed-full-content] Error:', err);
  process.exit(1);
});
