import type { ContentBlock, CourseLevel, LessonType, ResourceType } from '@luminai/contracts';
import { parseInlineMarkdown } from '@luminai/contracts';

/**
 * Sample catalogue for local development, demos and end-to-end tests. Titles and
 * metadata follow the catalogue design; the lesson text is short but real.
 */

interface DemoLesson {
  title: string;
  minutes: number;
  type?: LessonType;
  objectives?: string[];
  blocks: ContentBlock[];
  resources?: { type: ResourceType; title: string; url: string }[];
}

interface DemoCourse {
  slug: string;
  title: string;
  category: 'language' | 'communication' | 'leadership';
  level: CourseLevel;
  minutes: number;
  featuredRank?: number;
  summary: string;
  description: string;
  outcomes: string[];
  prerequisites?: string[];
  keywords?: string[];
  modules: { title: string; description?: string; lessons: DemoLesson[] }[];
}

const p = (markdown: string): ContentBlock => ({
  type: 'paragraph',
  content: parseInlineMarkdown(markdown),
});
const h = (text: string): ContentBlock => ({ type: 'heading', level: 2, text });
const tip = (markdown: string): ContentBlock => ({
  type: 'callout',
  tone: 'tip',
  content: parseInlineMarkdown(markdown),
});
const list = (...items: string[]): ContentBlock => ({
  type: 'list',
  style: 'bullet',
  items: items.map(parseInlineMarkdown),
});
const reflect = (prompt: string): ContentBlock => ({ type: 'reflection', prompt });
const example = (title: string, markdown: string): ContentBlock => ({
  type: 'example',
  title,
  content: parseInlineMarkdown(markdown),
});

function lesson(title: string, minutes: number, ...blocks: ContentBlock[]): DemoLesson {
  return { title, minutes, blocks };
}

export const DEMO_COURSES: DemoCourse[] = [
  {
    slug: 'public-speaking-essentials',
    title: 'Public speaking essentials',
    category: 'communication',
    level: 'BEGINNER',
    minutes: 300,
    featuredRank: 1,
    summary:
      'Plan, rehearse and deliver a short talk with voice practice and mentor feedback after every module.',
    description:
      'Most people are asked to speak long before anyone teaches them how. This course walks you through one short talk from first idea to delivery.\n\nEach module ends with a practice task you can record and review with your AI mentor.',
    outcomes: [
      'Open and close a talk with intent',
      'Control pace and pauses',
      'Answer questions calmly',
    ],
    keywords: ['presentation', 'stage fright', 'speech'],
    modules: [
      {
        title: 'Plan your talk',
        description: 'Decide what your audience should leave with, then build around it.',
        lessons: [
          lesson(
            'Start with one message',
            10,
            h('Why one message?'),
            p(
              'Listeners remember **one idea** far better than five. Before you write a single slide, finish this sentence: *"After my talk, people will…"*',
            ),
            tip('If you can’t say your message in one breath, it’s still too big.'),
            reflect('What is the one thing your audience should do differently after your talk?'),
          ),
          lesson(
            'Open with intent',
            12,
            p('Your first 30 seconds decide whether people lean in. Three openings that work:'),
            list(
              'A question your audience is already asking',
              'A short story with a turn',
              'A surprising number, explained',
            ),
            example(
              'An opening that works',
              '“Last year our team spent 400 hours in meetings that ended without a decision. Today I want to win some of those hours back.”',
            ),
          ),
        ],
      },
      {
        title: 'Deliver with control',
        lessons: [
          lesson(
            'Pace and pauses',
            15,
            p(
              'Nerves speed us up. A **two-second pause** after an important sentence feels long to you and natural to the room.',
            ),
            reflect('Record one minute of your talk. Where did you rush?'),
          ),
          lesson(
            'Answer questions calmly',
            12,
            p(
              'Repeat or rephrase the question, answer it in one sentence, then add one supporting point.',
            ),
            tip('“I don’t know, and I’ll find out” is a complete, credible answer.'),
          ),
        ],
      },
    ],
  },
  {
    slug: 'professional-english-writing',
    title: 'Professional English writing',
    category: 'language',
    level: 'INTERMEDIATE',
    minutes: 360,
    featuredRank: 2,
    summary: 'Clear emails, reports and summaries for work.',
    description:
      'Write messages that get read and acted on. You will practise structure, tone and concision on the kinds of emails and reports you write every week.',
    outcomes: [
      'Write emails with a clear ask',
      'Summarise a long document in five sentences',
      'Adjust tone for different readers',
    ],
    prerequisites: ['Comfortable reading English at work'],
    keywords: ['email', 'grammar', 'business english'],
    modules: [
      {
        title: 'Emails that get answers',
        lessons: [
          lesson(
            'Put the ask first',
            10,
            p(
              'Busy readers decide in the first line whether to act. State **what you need and by when** before the background.',
            ),
            example(
              'Before and after',
              'Before: “I wanted to follow up on the budget…” After: “Could you approve the Q3 budget by Friday? Details below.”',
            ),
          ),
          lesson(
            'Choose the right tone',
            12,
            p(
              'Formal is not the same as polite. Short sentences and plain words read as confident and respectful.',
            ),
            reflect('Rewrite the last email you sent in half the words.'),
          ),
        ],
      },
      {
        title: 'Reports and summaries',
        lessons: [
          lesson(
            'The five-sentence summary',
            15,
            list('Context', 'Problem', 'What we found', 'What we recommend', 'What happens next'),
          ),
        ],
      },
    ],
  },
  {
    slug: 'pronunciation-and-fluency',
    title: 'Pronunciation and fluency',
    category: 'language',
    level: 'BEGINNER',
    minutes: 240,
    summary: 'Sound clear and natural with guided voice drills.',
    description:
      'Short daily drills for the sounds, stress and rhythm that matter most for being understood.',
    outcomes: ['Use word stress to be understood', 'Link words naturally in fast speech'],
    keywords: ['accent', 'speaking', 'voice'],
    modules: [
      {
        title: 'Stress and rhythm',
        lessons: [
          lesson(
            'Word stress',
            10,
            p(
              'English listeners rely on stress more than on individual sounds. *PHOtograph*, *phoTOgraphy*, *photoGRAPHic*.',
            ),
            tip('Clap the stressed syllable as you say the word.'),
          ),
          lesson(
            'Linking words',
            10,
            p(
              'In natural speech, *an apple* sounds like *a napple*. Practise linking consonants to the vowel that follows.',
            ),
          ),
        ],
      },
    ],
  },
  {
    slug: 'negotiation-basics',
    title: 'Negotiation basics',
    category: 'communication',
    level: 'INTERMEDIATE',
    minutes: 300,
    summary: 'Prepare, listen actively and reach fair agreements.',
    description:
      'A practical introduction to interest-based negotiation for everyday work situations.',
    outcomes: ['Prepare your walk-away point', 'Separate positions from interests'],
    keywords: ['bargaining', 'agreement', 'persuasion'],
    modules: [
      {
        title: 'Before the conversation',
        lessons: [
          lesson(
            'Know your walk-away point',
            12,
            p(
              'Your **BATNA** (best alternative to a negotiated agreement) is what you will do if you don’t agree. Know it before you start.',
            ),
            reflect('What is your best alternative in a negotiation you have coming up?'),
          ),
        ],
      },
      {
        title: 'At the table',
        lessons: [
          lesson(
            'Positions and interests',
            14,
            p(
              'A position is what someone asks for. An interest is *why* they ask for it. Agreements live in the interests.',
            ),
          ),
        ],
      },
    ],
  },
  {
    slug: 'leadership-fundamentals',
    title: 'Leadership fundamentals',
    category: 'leadership',
    level: 'BEGINNER',
    minutes: 240,
    summary: 'What effective leaders do in their first 90 days.',
    description:
      'For new and aspiring team leads: build trust, set direction and run one-to-ones that matter.',
    outcomes: ['Run a useful one-to-one', 'Set clear expectations with your team'],
    keywords: ['manager', 'team lead', 'first time manager'],
    modules: [
      {
        title: 'Your first 90 days',
        lessons: [
          lesson(
            'Listen before you change',
            10,
            p(
              'Spend your first weeks asking three questions of everyone: *What works? What doesn’t? What would you change?*',
            ),
          ),
          lesson(
            'One-to-ones that matter',
            12,
            list(
              'Their agenda first',
              'One thing to improve, one thing to keep',
              'Agree a next step',
            ),
          ),
        ],
      },
    ],
  },
  {
    slug: 'resolving-team-conflict',
    title: 'Resolving team conflict',
    category: 'leadership',
    level: 'ADVANCED',
    minutes: 420,
    summary: 'Turn disagreement into decisions your team supports.',
    description: 'Tools for leaders who need to mediate, decide and repair working relationships.',
    outcomes: ['Mediate a disagreement between two colleagues', 'Make a decision people commit to'],
    prerequisites: ['Some experience leading a team'],
    keywords: ['mediation', 'disagreement', 'difficult conversations'],
    modules: [
      {
        title: 'Understand the conflict',
        lessons: [
          lesson(
            'Task, process or relationship?',
            14,
            p(
              'Disagreements about **tasks** can be healthy. Conflicts about **process** and **relationships** need your attention early.',
            ),
          ),
        ],
      },
    ],
  },
];
