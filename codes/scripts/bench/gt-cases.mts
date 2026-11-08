/**
 * Kasus uji benchmark evaluasi Writing General Training (ADR-004).
 * `range` = rentang band yang dapat diterima untuk rata-rata 4 kriteria (toleransi ±0,5 dari penilaian manusia).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const essay = (n: number) => readFileSync(path.join(here, 'essays', `band${n}.txt`), 'utf8').trim();

export interface GtCase {
  id: string;
  kind: 'WRITING_TASK1' | 'WRITING_TASK2';
  prompt: string;
  response: string;
  range: [number, number];
  /** Nilai yang wajib untuk task_requirement_met, bila ada. */
  requirementMet?: boolean;
}

const LAPTOP_TASK = `You recently bought a laptop from an online shop, but it arrived with a broken screen. Write a letter to the shop manager. In your letter: describe what happened; explain what you want the shop to do; say how this has affected you. Begin your letter: Dear Sir or Madam,`;
const TASK2 = `Some people think that governments should spend more money on public transport rather than building new roads. To what extent do you agree or disagree? Give reasons for your answer and include relevant examples from your own knowledge or experience.`;

export const CASES: GtCase[] = [
  {
    id: 'L1-weak-slang',
    kind: 'WRITING_TASK1',
    prompt: LAPTOP_TASK,
    response: `hey shop guy,\n\nmy laptop is broken lol. screen not work. i buy it last week. u must fix it fast ok. bye`,
    range: [1.5, 3.5],
    requirementMet: false,
  },
  {
    id: 'L2-mid-errors',
    kind: 'WRITING_TASK1',
    prompt: LAPTOP_TASK,
    response: `Dear Sir or Madam,

I am write to you because I buyed a laptop from your shop last week. When it come to my house, the screen is broken. I very disappointed about this.

I order the laptop in your website on 3 November. The delivery man bring it on Monday but the box was already damaged. I open it and I see the screen have a big crack. I think it broken when the delivery.

I want you to change the laptop with a new one or give me my money back. Please tell me what I must do and when I can get it, because I wait since long time.

This is affect me bad because I need the laptop for my study. I can not do my homework and I late to send my assignment to my teacher. I hope you can help me fast.

Thank you.

Yours faithfully,
Rina`,
    range: [4.5, 6.0],
  },
  {
    id: 'L3-good',
    kind: 'WRITING_TASK1',
    prompt: LAPTOP_TASK,
    response: `Dear Sir or Madam,

I am writing to complain about the laptop that I bought from your website last week. When it arrived, the screen was broken and I cannot use it at all.

I ordered the laptop on 3 November and the parcel came on Monday. The box looked damaged on the outside, and when I opened it I saw a crack across the whole screen. I took photos of the box and the laptop so that I can send them to you as proof.

I would like you to send me a new laptop as soon as possible, or give me a full refund if you do not have one in stock. Please also tell me how to send back the damaged one and who will pay for the postage.

This problem has caused me a great deal of inconvenience because I need the laptop for my online course and I have already missed two lessons. I hope that you will resolve this matter quickly.

I look forward to hearing from you.

Yours faithfully,
Rina Putri`,
    range: [6.0, 7.5],
    requirementMet: true,
  },
  {
    id: 'L4-wrong-register',
    kind: 'WRITING_TASK1',
    prompt: LAPTOP_TASK,
    response: `Hi shop manager,

Hope you're doing great! So, I got my new laptop from your online shop last week and, honestly, I'm pretty bummed out. The screen was totally smashed when I opened the box, which was a real shock.

Basically, I ordered it on 3 November and it turned up on Monday. The box looked a bit beaten up, so I guess the courier dropped it somewhere. I took some pics if you need them.

What I'd love is for you guys to swap it for a brand new one, or just give me my cash back, whichever is easier for you. Let me know how to send this one back too, and who's paying for that.

It's been a real pain because I need it for my online classes and I've already skipped two of them. Seriously stressful!

Anyway, hope you can sort it out soon. Cheers,
Rina`,
    range: [4.5, 6.0],
  },
  { id: 'T2-band5', kind: 'WRITING_TASK2', prompt: TASK2, response: essay(5), range: [4.5, 5.5] },
  { id: 'T2-band6', kind: 'WRITING_TASK2', prompt: TASK2, response: essay(6), range: [5.5, 6.5] },
  { id: 'T2-band7', kind: 'WRITING_TASK2', prompt: TASK2, response: essay(7), range: [6.5, 7.5] },
];
