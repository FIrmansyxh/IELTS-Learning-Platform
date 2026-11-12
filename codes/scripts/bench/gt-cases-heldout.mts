/**
 * Kasus uji HELD-OUT benchmark evaluasi Writing General Training (ADR-004, putaran 4).
 * Sengaja memakai soal dan topik berbeda dari gt-cases.mts (surat laptop, esai transportasi umum)
 * agar tidak tumpang tindih dengan kasus yang dipakai menyetel prompt (petunjuk `text` dan `calib`).
 * `range` = rentang band yang dapat diterima, ditetapkan agen (BELUM diverifikasi penguji IELTS).
 */
import type { GtCase } from './gt-cases.mts';

const VISIT_TASK = `A friend from another country is planning to visit your town next month. Write a letter to your friend. In your letter: say when the best time to visit would be; suggest places to see and things to do; offer to arrange somewhere for your friend to stay. Begin your letter: Dear Marco,`;
const HEATING_TASK = `You rent a flat and the heating has not worked for two weeks. Write a letter to the landlord. In your letter: describe the problem; explain how it has affected you; say what you want the landlord to do about it. Begin your letter: Dear Sir or Madam,`;
const LEAVE_TASK = `You would like to take a week off work to attend your sister's wedding abroad. Write a letter to your manager. In your letter: explain why you need the time off; say exactly when you would be away; suggest how your work could be covered while you are away. Begin your letter: Dear Mr Evans,`;
const WFH_TASK = `More and more people are working from home instead of going to an office. Do the advantages of this development outweigh the disadvantages? Give reasons for your answer and include relevant examples from your own knowledge or experience.`;

export const CASES: GtCase[] = [
  {
    id: 'H1-informal-good',
    kind: 'WRITING_TASK1',
    prompt: VISIT_TASK,
    response: `Dear Marco,

It was great to get your email, and I can't wait to see you! I'm so glad you're finally coming to visit me in Jakarta.

The best time for you to come would be the end of June. The weather is dry and sunny then, and the rainy season is over, so we will be able to go out every day. It is also the school holidays, so I'll have a few days off work and can show you around myself.

There is so much to see here. I'd definitely take you to the old town, where you can try street food and visit the museums, and we could also spend a weekend at the beach in Anyer, which is only two hours away by car. If you like hiking, there's a lovely volcano near Bandung that we could climb at sunrise. I'm sure you will love it!

As for accommodation, you don't need to book a hotel. You're very welcome to stay at my flat. I have a spare room with a comfortable bed, and it's close to the train station, so it will be easy to get around.

Let me know your flight details when you have them and I'll pick you up from the airport.

Take care and see you soon,
Dewi`,
    range: [6.5, 8.0],
    requirementMet: true,
  },
  {
    id: 'H2-formal-weak',
    kind: 'WRITING_TASK1',
    prompt: HEATING_TASK,
    response: `Dear Sir or Madam,

I write to you for tell about the heating in my flat. It is not work since two weeks and I am very cold in the night. I live in the flat number 12 on Green Street.

I try to call you many time but nobody answer the phone. My little brother is get sick because the cold and he can not go to school. I also have the headache every morning.

Please you understand my problem.

Yours faithfully,
Anna`,
    range: [3.0, 4.5],
    requirementMet: false,
  },
  {
    id: 'H3-semiformal-mid',
    kind: 'WRITING_TASK1',
    prompt: LEAVE_TASK,
    response: `Dear Mr Evans,

I am writing to ask whether I could take some days off work next month. My sister is getting married in Brisbane on 14 April, and I would very much like to attend the wedding.

I would need to be away for one week, from 11 to 18 April, because the flight takes almost a day and I will need time to recover. I have worked at the company for two years and I have not took a long holiday since last summer.

I have think about how my work could be cover while I am away. My colleague Sarah knows the main client accounts, so she could answer their emails. I will also prepare a document that explain all the urgent tasks before I leave, and I will check my email once a day in case of any emergency.

I hope that you will agree to my request. I would be glad to discuss it with you at any time.

Yours sincerely,
Tom Hardy`,
    range: [5.5, 7.0],
    requirementMet: true,
  },
  {
    id: 'H4-wrong-register',
    kind: 'WRITING_TASK1',
    prompt: VISIT_TASK,
    response: `Dear Mr Marco Rossi,

I am writing to inform you that I have received your correspondence regarding your intended visit to my city. I would like to express my sincere gratitude for your notification.

With regard to the most suitable period for your visit, I would recommend the month of June, as the climatic conditions are most favourable during that time. Furthermore, numerous cultural attractions will be open to the public, including the National Museum and the historic old town.

Concerning accommodation, I would be pleased to offer you a room in my residence, should you find this arrangement acceptable. I trust that this will be of assistance to you.

I look forward to receiving your prompt reply.

Yours faithfully,
Dewi Lestari`,
    range: [4.5, 6.0],
  },
  {
    id: 'H5-essay-band5',
    kind: 'WRITING_TASK2',
    prompt: WFH_TASK,
    response: `Nowadays many people work at home. I think it have advantage and disadvantage but I think advantage is more than disadvantage.

First, work from home is good because people can save the money. They not need to pay for bus or petrol every day. Also they can save time because they no need go to the office, so they can sleep more and have more time for family. This is very good for the people who have small children.

Second, people can work comfortable at home. They can wear what they want and eat food from their kitchen. Some people say they work more good when it quiet at home than in the office who is noisy.

But, there is some disadvantage too. Some people feel lonely when work at home because they not talk to colleagues every day. Another problem is the home sometimes is not good for work. For example, when children is at home they make noise and the worker can not focus on the job. Also the boss can not see the worker so some workers is lazy and not do the work.

In conclusion, I think working from home have more advantage than disadvantage because people can save money, time and be comfortable. But the companies must make rule so the worker still do the job good.`,
    range: [4.5, 5.5],
  },
  {
    id: 'H6-essay-band6',
    kind: 'WRITING_TASK2',
    prompt: WFH_TASK,
    response: `In recent years, working from home have become much more common, especially since the pandemic. Although this arrangement has some drawbacks, I believe that the advantages outweigh them.

The main benefit of working remotely is the saving of time and money. Employees does not have to spend hours in traffic every morning, so they have more energy for their jobs and for their families. In addition, they spend less on transport, fuel and lunches. For companies, there is also a financial advantage because they can rent more smaller offices, which reduce their costs significantly.

Another advantage is flexibility. People who work at home can often organise their day in the way that suits them best. For example, a parent can take their child to school and then start work, which is almost impossible in traditional office job. This can make workers happier and more productive.

However, there are some disadvantages that should not be ignored. Many people feel isolated when they do not meet their colleagues, and this can affect their mental health. Furthermore, it is sometimes difficult to separate between work and private life, so employees may end up working longer hours than before. Communication can also be slower, because it is not possible to simply ask a question across the desk.

To sum up, working from home has problems such as loneliness and poor communication, but I think the benefits of saving time, money and having flexible hours is more important. Companies can solve the problems by organising regular online meetings and occasional days in the office.`,
    range: [5.5, 6.5],
  },
  {
    id: 'H7-essay-band7',
    kind: 'WRITING_TASK2',
    prompt: WFH_TASK,
    response: `The rise of remote working has transformed the way many of us think about employment. While it is not without drawbacks, I would argue that the benefits clearly outweigh the costs, provided that employers and employees manage the arrangement sensibly.

Perhaps the most compelling advantage is the reclaiming of time. A daily commute of ninety minutes amounts to roughly one working month per year, and eliminating it allows people to sleep, exercise or spend time with their families. Moreover, the money saved on fares and fuel can be significant, particularly in cities where transport is expensive. Employers also stand to gain, since smaller offices mean lower rents and utility bills, and several surveys suggest that staff who control their own schedules tend to be more productive.

Flexibility is a further benefit, especially for parents and people with disabilities, for whom a conventional workplace may be impractical. In my own experience, being able to arrange my hours around caring responsibilities made it possible to stay in a job that I would otherwise have had to leave.

Nevertheless, remote work has genuine drawbacks. Isolation is the most frequently cited, as casual conversations with colleagues provide not only company but also ideas and support. In addition, the boundary between work and leisure can blur, leading to longer hours and exhaustion. These problems are real, but they can be reduced through regular video meetings, occasional office days and clear agreements about working hours.

In conclusion, working from home offers substantial savings in time and money, together with greater flexibility, and these outweigh the difficulties, which are largely manageable.`,
    range: [6.5, 7.5],
  },
  {
    id: 'H8-essay-offtopic',
    kind: 'WRITING_TASK2',
    prompt: WFH_TASK,
    response: `Regular exercise is one of the most important habits for a healthy life. Many people today spend long hours sitting in front of computers, and this causes serious health problems such as obesity, heart disease and back pain. In my opinion, everyone should do at least thirty minutes of physical activity every day.

First of all, exercise improves physical health. People who run, swim or cycle regularly have stronger hearts and lower blood pressure. Doctors also say that active people are less likely to develop diabetes. For example, a study in Japan showed that people who walked every day lived longer than those who did not.

Secondly, exercise is good for mental health. When we do sports, our body produces chemicals that make us feel happy and reduce stress. Many students feel calmer and concentrate better after playing football or going to the gym.

Finally, doing sports with other people helps us make friends and build team spirit. Joining a running club or a basketball team can make us feel less lonely and more confident.

In conclusion, exercise gives us a stronger body, a calmer mind and better relationships, so governments and schools should encourage people to be active every day.`,
    range: [4.0, 5.5],
    requirementMet: false,
  },
];
