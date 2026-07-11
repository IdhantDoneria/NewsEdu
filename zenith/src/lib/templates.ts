// ─── Zenith templates ─────────────────────────────────────────────────────────
// Gallery source for the Templates modal + reusable creators for first-run seed.
// Every template builds real pages/blocks via the store and returns the root
// page id, so anything created here is fully editable afterwards.

import { uid } from './id';
import { createBlock, createPage } from './store';
import type { BlockType, DbSchema, SelectOption, ViewDef, ViewType } from './types';

export type TemplateCategory = 'Work' | 'Personal' | 'Knowledge';

export interface TemplateDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  category: TemplateCategory;
  create: (parentId: string | null) => string;
}

// ─── small builders ───────────────────────────────────────────────────────────

const DAY = 86_400_000;

/** midnight timestamp n days from today — date property values */
function day(offset: number): number {
  const d = new Date(Date.now() + offset * DAY);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function opt(name: string, color: string): SelectOption {
  return { id: uid(), name, color };
}

function view(name: string, type: ViewType, extra: Partial<ViewDef> = {}): ViewDef {
  return {
    id: uid(), name, type,
    filters: [], filterMode: 'and', sorts: [], hiddenProps: [], layout: {},
    ...extra,
  };
}

/** sequential block writer — blocks land in call order */
function writer(pageId: string) {
  return (type: BlockType, html = '', props: Record<string, any> = {}, parentId: string | null = null): string =>
    createBlock(pageId, { type, html, props, parentId });
}

/** columns block with n empty column children; returns the column ids */
function columns(pageId: string, n: number): string[] {
  const colsId = createBlock(pageId, { type: 'columns' });
  return Array.from({ length: n }, () => createBlock(pageId, { type: 'column', parentId: colsId }));
}

/** inline database on a host page; returns the database page id */
function database(hostId: string, title: string, icon: string, schema: DbSchema): string {
  const dbId = createPage({ parentId: hostId, type: 'database', title, icon, dbSchema: schema, empty: true });
  createBlock(hostId, { type: 'childDatabase', props: { pageId: dbId } });
  return dbId;
}

function row(dbId: string, title: string, rowProps: Record<string, any>, icon?: string): string {
  return createPage({ parentId: dbId, databaseId: dbId, title, icon, rowProps, empty: true });
}

// ─── 1 · Meeting Notes ────────────────────────────────────────────────────────

function createMeetingNotes(parentId: string | null): string {
  const id = createPage({ parentId, title: 'Meeting Notes', icon: '📋', cover: 'g:graphite', empty: true });
  const b = writer(id);
  b('callout', '<b>When</b> Thursday · 10:00 &nbsp;·&nbsp; <b>Where</b> Boardroom / Meet &nbsp;·&nbsp; <b>Scribe</b> rotates — today it is you', { icon: '🗓️', bg: 'gray' });
  b('h2', 'Attendees');
  b('todo', 'Ava Chen — Product', { checked: true });
  b('todo', 'Noah Park — Engineering', { checked: true });
  b('todo', 'Mia Rossi — Design');
  b('h2', 'Agenda');
  b('numbered', 'Review last week’s action items');
  b('numbered', 'Roadmap checkpoint — where are we, honestly');
  b('numbered', 'Risks &amp; blockers');
  b('numbered', 'Decisions needed today');
  b('h2', 'Discussion');
  b('paragraph', 'Capture key points in your own words — verbatim only when the phrasing matters.');
  b('bulleted', 'Open question: do we cut scope or move the date?');
  b('bulleted', '');
  b('h2', 'Decisions');
  b('callout', 'Every decision gets an <b>owner</b> and a <b>date</b> — future you will come asking.', { icon: '✅', bg: 'green' });
  b('h2', 'Action items');
  b('todo', '<b>Ava</b> — circulate the revised spec by Friday');
  b('todo', '<b>Noah</b> — spike the migration plan, report effort');
  b('todo', '<b>Mia</b> — usability pass on onboarding');
  b('h2', 'Next steps');
  b('paragraph', 'Same time next week. Anything unresolved goes back on the agenda — nothing dies in silence.');
  return id;
}

// ─── 2 · Project Tracker ──────────────────────────────────────────────────────

export function createProjectTracker(parentId: string | null): string {
  const id = createPage({ parentId, title: 'Project Tracker', icon: '🎯', cover: 'g:midnight', empty: true });
  const b = writer(id);
  b('paragraph', 'Everything in flight, on one board. Drag cards as work moves; the table and timeline read from the same source.');

  const titleId = uid();
  const statusId = uid();
  const priorityId = uid();
  const ownerId = uid();
  const dueId = uid();
  const status = [opt('Backlog', 'gray'), opt('In progress', 'blue'), opt('Review', 'yellow'), opt('Done', 'green')];
  const priority = [opt('P0', 'red'), opt('P1', 'orange'), opt('P2', 'gray')];
  const schema: DbSchema = {
    titlePropId: titleId,
    properties: [
      { id: titleId, name: 'Name', type: 'title' },
      { id: statusId, name: 'Status', type: 'select', options: status },
      { id: priorityId, name: 'Priority', type: 'select', options: priority },
      { id: ownerId, name: 'Owner', type: 'text' },
      { id: dueId, name: 'Due', type: 'date' },
    ],
    views: [
      view('Board', 'board', { groupByPropId: statusId }),
      view('Table', 'table'),
      view('Timeline', 'timeline', { layout: { dateProp: dueId } }),
    ],
  };
  const dbId = database(id, 'Projects', '🎯', schema);
  row(dbId, 'Website redesign', { [statusId]: 'In progress', [priorityId]: 'P1', [ownerId]: 'Ava Chen', [dueId]: day(10) }, '🖼️');
  row(dbId, 'Q3 pricing review', { [statusId]: 'Review', [priorityId]: 'P0', [ownerId]: 'Mia Rossi', [dueId]: day(3) }, '💶');
  row(dbId, 'Customer onboarding revamp', { [statusId]: 'In progress', [priorityId]: 'P1', [ownerId]: 'Leo Maas', [dueId]: day(14) }, '🚪');
  row(dbId, 'Mobile app beta', { [statusId]: 'Backlog', [priorityId]: 'P2', [ownerId]: 'Noah Park', [dueId]: day(24) }, '📱');
  row(dbId, 'Analytics pipeline v2', { [statusId]: 'Done', [priorityId]: 'P2', [ownerId]: 'Ivy Tan', [dueId]: day(-2) }, '📈');
  return id;
}

// ─── 3 · Weekly Planner ───────────────────────────────────────────────────────

function createWeeklyPlanner(parentId: string | null): string {
  const id = createPage({ parentId, title: 'Weekly Planner', icon: '🗓️', cover: 'g:azure', empty: true });
  const b = writer(id);

  const monday = new Date();
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  b('h1', `Week of ${monday.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}`);
  b('paragraph', 'Three big things, then everything else. Plan Sunday evening; adjust without guilt.');

  const [mon, thu, wknd] = columns(id, 3);
  const c = writer(id);
  c('h3', 'Mon – Wed', {}, mon);
  c('todo', 'Deep work: ship the draft', {}, mon);
  c('todo', '30-minute run, no podcast', {}, mon);
  c('todo', 'Inbox to zero, once', {}, mon);
  c('h3', 'Thu – Fri', {}, thu);
  c('todo', 'Review the week’s writing', {}, thu);
  c('todo', 'Plan next sprint', {}, thu);
  c('todo', 'Long lunch with a friend', {}, thu);
  c('h3', 'Weekend', {}, wknd);
  c('todo', 'Slow morning, long walk', {}, wknd);
  c('todo', 'Read 50 pages', {}, wknd);
  c('todo', 'Prep Monday in 15 minutes', {}, wknd);

  b('callout', '<b>Habits</b> — meditate · move · read · lights out by 11.', { icon: '🔁', bg: 'gold' });
  b('h2', 'Wins of the week');
  b('quote', 'Write down three — however small. Momentum is built from noticing it.');
  return id;
}

// ─── 4 · Reading List ─────────────────────────────────────────────────────────

export function createReadingList(parentId: string | null): string {
  const id = createPage({ parentId, title: 'Reading List', icon: '📚', cover: 'g:porcelain', empty: true });
  const b = writer(id);
  b('paragraph', 'A shelf with intent — every book earns its place, and a one-line verdict when it leaves.');

  const titleId = uid();
  const authorId = uid();
  const genreId = uid();
  const statusId = uid();
  const ratingId = uid();
  const notesId = uid();
  const schema: DbSchema = {
    titlePropId: titleId,
    properties: [
      { id: titleId, name: 'Name', type: 'title' },
      { id: authorId, name: 'Author', type: 'text' },
      {
        id: genreId, name: 'Genre', type: 'multiSelect',
        options: [
          opt('Philosophy', 'purple'), opt('Productivity', 'blue'), opt('Finance', 'gold'),
          opt('Fiction', 'pink'), opt('Science', 'green'), opt('Biography', 'brown'),
        ],
      },
      { id: statusId, name: 'Status', type: 'select', options: [opt('To read', 'gray'), opt('Reading', 'blue'), opt('Finished', 'green')] },
      {
        id: ratingId, name: 'Rating', type: 'select',
        options: [opt('★', 'gray'), opt('★★', 'brown'), opt('★★★', 'yellow'), opt('★★★★', 'orange'), opt('★★★★★', 'gold')],
      },
      { id: notesId, name: 'Notes', type: 'text' },
    ],
    views: [view('Gallery', 'gallery'), view('Table', 'table')],
  };
  const dbId = database(id, 'Library', '📚', schema);
  row(dbId, 'Deep Work', { [authorId]: 'Cal Newport', [genreId]: ['Productivity'], [statusId]: 'Finished', [ratingId]: '★★★★★', [notesId]: 'Schedule depth, then defend it ruthlessly.' }, '🧠');
  row(dbId, 'Meditations', { [authorId]: 'Marcus Aurelius', [genreId]: ['Philosophy'], [statusId]: 'Reading', [ratingId]: '★★★★★', [notesId]: 'Notes to self from an emperor — still sharp.' }, '🏛️');
  row(dbId, 'The Almanack of Naval Ravikant', { [authorId]: 'Eric Jorgenson', [genreId]: ['Philosophy', 'Finance'], [statusId]: 'Finished', [ratingId]: '★★★★', [notesId]: 'Leverage, judgment, and peace as a form of wealth.' }, '⛵');
  row(dbId, 'Atomic Habits', { [authorId]: 'James Clear', [genreId]: ['Productivity'], [statusId]: 'Finished', [ratingId]: '★★★★', [notesId]: 'Systems over goals; identity over outcomes.' }, '⚛️');
  row(dbId, 'The Psychology of Money', { [authorId]: 'Morgan Housel', [genreId]: ['Finance'], [statusId]: 'To read', [notesId]: 'Behaviour beats spreadsheets, allegedly.' }, '💵');
  row(dbId, 'Project Hail Mary', { [authorId]: 'Andy Weir', [genreId]: ['Fiction', 'Science'], [statusId]: 'To read', [notesId]: 'Saving it for a long flight.' }, '🚀');
  return id;
}

// ─── 5 · Habit Tracker ────────────────────────────────────────────────────────

function createHabitTracker(parentId: string | null): string {
  const id = createPage({ parentId, title: 'Habit Tracker', icon: '✅', cover: 'g:forest', empty: true });
  const b = writer(id);
  b('paragraph', 'Tick the day, keep the chain. Sunday night the boxes reset — the streak remembers.');

  const titleId = uid();
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const dayIds = days.map(() => uid());
  const streakId = uid();
  const schema: DbSchema = {
    titlePropId: titleId,
    properties: [
      { id: titleId, name: 'Habit', type: 'title' },
      ...days.map((name, i) => ({ id: dayIds[i], name, type: 'checkbox' as const })),
      { id: streakId, name: 'Streak', type: 'number' as const, numberFormat: 'plain' as const },
    ],
    views: [view('Week', 'table')],
  };
  const dbId = database(id, 'This week', '✅', schema);
  const week = (...ticks: number[]): Record<string, any> => {
    const props: Record<string, any> = {};
    ticks.forEach((t) => { props[dayIds[t]] = true; });
    return props;
  };
  row(dbId, 'Meditate', { ...week(0, 1, 2), [streakId]: 12 }, '🧘');
  row(dbId, 'Gym', { ...week(0, 2), [streakId]: 4 }, '🏋️');
  row(dbId, 'Read 20 pages', { ...week(0, 1), [streakId]: 21 }, '📖');
  row(dbId, 'No sugar', { ...week(1), [streakId]: 2 }, '🚫');
  row(dbId, 'Ship something', { ...week(0), [streakId]: 7 }, '🚢');
  return id;
}

// ─── 6 · OKRs ─────────────────────────────────────────────────────────────────

function createOKRs(parentId: string | null): string {
  const id = createPage({ parentId, title: 'OKRs', icon: '🧭', cover: 'g:bordeaux', empty: true });
  const b = writer(id);
  const d = new Date();
  b('h1', `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`);
  b('paragraph', 'Three objectives, three key results each. If everything is a priority, nothing is.');
  b('callout', '<b>Scoring</b> — 0.3 means you showed up, 0.7 is success, 1.0 means you sandbagged. Grade honestly at quarter’s end.', { icon: '🎯', bg: 'gold' });

  const o1 = b('h2', 'O1 — Make onboarding effortless', { toggleable: true });
  b('todo', 'KR1 — Time-to-first-page under 60 seconds · now 2m 40s · <code>0.3</code>', {}, o1);
  b('todo', 'KR2 — Activation rate 38% → 55% · <code>0.4</code>', {}, o1);
  b('todo', 'KR3 — Setup support tickets down 50% · <code>0.6</code>', { checked: false }, o1);

  const o2 = b('h2', 'O2 — Be the fastest workspace anywhere', { toggleable: true });
  b('todo', 'KR1 — p95 page load under 200 ms · <code>0.7</code>', { checked: true }, o2);
  b('todo', 'KR2 — Offline mode passes 100% of sync tests · <code>0.5</code>', {}, o2);
  b('todo', 'KR3 — Zero data-loss incidents all quarter · <code>1.0 so far</code>', {}, o2);

  const o3 = b('h2', 'O3 — Build a brand people quote', { toggleable: true });
  b('todo', 'KR1 — Ten customer stories published · <code>0.2</code>', {}, o3);
  b('todo', 'KR2 — Newsletter 2k → 10k subscribers · <code>0.3</code>', {}, o3);
  b('todo', 'KR3 — NPS at 60 or better · <code>0.5</code>', {}, o3);

  b('divider');
  b('paragraph', 'Review every other Friday: score, learn, rewrite. OKRs are a compass, not a contract.');
  return id;
}

// ─── 7 · Daily Journal ────────────────────────────────────────────────────────

function createDailyJournal(parentId: string | null): string {
  const id = createPage({ parentId, title: 'Daily Journal', icon: '✍️', cover: 'g:champagne', empty: true });
  const b = writer(id);
  b('h1', new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }));
  b('h3', 'Grateful for');
  b('bulleted', 'The quiet hour before anyone else wakes');
  b('bulleted', 'A friend who asks the second question');
  b('bulleted', 'Coffee — again, faithfully');
  b('quote', '<i>Today I will move deliberately: one thing at a time, done properly.</i>');
  b('h3', 'The log');
  b('paragraph', 'What happened, plainly told. Skip nothing interesting; embellish nothing dull.');
  b('paragraph', '');
  const refl = b('toggle', '🌙 Evening reflection');
  b('bulleted', 'What did I do well today?', {}, refl);
  b('bulleted', 'What would I do differently?', {}, refl);
  b('bulleted', 'What deserves to be remembered?', {}, refl);
  return id;
}

// ─── 8 · Content Calendar ─────────────────────────────────────────────────────

function createContentCalendar(parentId: string | null): string {
  const id = createPage({ parentId, title: 'Content Calendar', icon: '📅', cover: 'g:aurum', empty: true });
  const b = writer(id);
  b('paragraph', 'Plan the month, publish on rhythm. Ideas go in rough; the calendar makes them honest.');

  const titleId = uid();
  const channelId = uid();
  const statusId = uid();
  const dateId = uid();
  const schema: DbSchema = {
    titlePropId: titleId,
    properties: [
      { id: titleId, name: 'Name', type: 'title' },
      {
        id: channelId, name: 'Channel', type: 'select',
        options: [opt('Blog', 'purple'), opt('X', 'blue'), opt('YouTube', 'red'), opt('Newsletter', 'gold')],
      },
      {
        id: statusId, name: 'Status', type: 'select',
        options: [opt('Idea', 'gray'), opt('Drafting', 'blue'), opt('Scheduled', 'yellow'), opt('Published', 'green')],
      },
      { id: dateId, name: 'Publish date', type: 'date' },
    ],
    views: [
      view('Calendar', 'calendar', { layout: { dateProp: dateId } }),
      view('Table', 'table'),
    ],
  };
  const dbId = database(id, 'Pipeline', '📅', schema);
  row(dbId, 'How we built instant search', { [channelId]: 'Blog', [statusId]: 'Published', [dateId]: day(-9) }, '🔍');
  row(dbId, 'Thread: ten keyboard-first habits', { [channelId]: 'X', [statusId]: 'Published', [dateId]: day(-3) }, '⌨️');
  row(dbId, 'Monthly letter — what shipped', { [channelId]: 'Newsletter', [statusId]: 'Scheduled', [dateId]: day(2) }, '💌');
  row(dbId, 'Desk tour: a calmer setup', { [channelId]: 'YouTube', [statusId]: 'Drafting', [dateId]: day(6) }, '🎥');
  row(dbId, 'Templates that actually save time', { [channelId]: 'Blog', [statusId]: 'Idea', [dateId]: day(12) }, '🧩');
  return id;
}

// ─── 9 · Travel Planner ───────────────────────────────────────────────────────

function createTravelPlanner(parentId: string | null): string {
  const id = createPage({ parentId, title: 'Travel Planner', icon: '✈️', cover: 'g:azure', empty: true });
  const b = writer(id);
  b('callout', '<b>Kyoto · 5 days</b> — flights booked, two dinners reserved, the rest left deliberately to wandering.', { icon: '🧳', bg: 'blue' });

  b('h2', 'Itinerary');
  const d1 = b('toggle', '<b>Day 1</b> — Arrive &amp; Gion at dusk');
  b('bulleted', 'Land 14:10 · Haruka express to the hotel', {}, d1);
  b('bulleted', 'Walk Hanamikoji Street before dinner', {}, d1);
  b('bulleted', 'Early night — jet lag is a choice', {}, d1);
  const d2 = b('toggle', '<b>Day 2</b> — Temples in the north');
  b('bulleted', 'Kinkaku-ji at opening, before the crowds', {}, d2);
  b('bulleted', 'Ryoan-ji rock garden — sit a while', {}, d2);
  b('bulleted', 'Evening kaiseki, reservation at 19:00', {}, d2);
  const d3 = b('toggle', '<b>Day 3</b> — Arashiyama');
  b('bulleted', 'Bamboo grove at 07:00, camera ready', {}, d3);
  b('bulleted', 'Climb to the monkey park lookout', {}, d3);
  b('bulleted', 'River boat in the late afternoon', {}, d3);

  b('h2', 'Packing');
  const [carry, checked] = columns(id, 2);
  const c = writer(id);
  c('h3', 'Carry-on', {}, carry);
  c('todo', 'Passport + IC card', {}, carry);
  c('todo', 'Camera, spare battery', {}, carry);
  c('todo', 'Kindle — loaded', {}, carry);
  c('todo', 'Travel adapter', {}, carry);
  c('h3', 'Checked', {}, checked);
  c('todo', 'Walking shoes, already broken in', {}, checked);
  c('todo', 'Layers — the evenings run cold', {}, checked);
  c('todo', 'Foldable day bag', {}, checked);
  c('todo', 'Small gifts for hosts', {}, checked);

  b('h2', 'Budget');
  b('table', '', {
    headerRow: true,
    rows: [
      ['Item', 'Planned', 'Actual'],
      ['Flights', '$820', ''],
      ['Hotel — 4 nights', '$640', ''],
      ['Food & tea', '$300', ''],
      ['Transit & temples', '$120', ''],
      ['Total', '$1,880', ''],
    ],
  });

  b('h2', 'Bookings');
  b('bookmark', '', { url: 'https://www.japan-guide.com/e/e2158.html', caption: 'Kyoto — travel guide' });
  b('bookmark', '', { url: 'https://www.google.com/travel/flights', caption: 'Flight itinerary' });
  b('bookmark', '', { url: 'https://www.booking.com', caption: 'Hotel confirmation' });
  return id;
}

// ─── 10 · Cornell Notes ───────────────────────────────────────────────────────

function createCornellNotes(parentId: string | null): string {
  const id = createPage({ parentId, title: 'Cornell Notes', icon: '🎓', cover: 'g:midnight', empty: true });
  const b = writer(id);
  b('quote', 'Divide the page: <b>cues</b> on the left, <b>notes</b> on the right, a summary at the foot. Recall beats rereading — Walter Pauk, Cornell, 1949.');

  const [cues, notes] = columns(id, 2);
  const c = writer(id);
  c('h3', 'Cues', {}, cues);
  c('bulleted', 'What is the central question?', {}, cues);
  c('bulleted', 'Term to define later', {}, cues);
  c('bulleted', 'How does this connect to last lecture?', {}, cues);
  c('h3', 'Notes', {}, notes);
  c('bulleted', 'Capture ideas in your own words — abbreviations welcome', {}, notes);
  c('bulleted', 'One idea per line; leave room to add on review', {}, notes);
  c('bulleted', 'Mark anything you did not understand with <code>?</code>', {}, notes);

  b('callout', '<b>Summary</b> — in two sentences, what must you remember from this page? Write it the same day.', { icon: '🧾', bg: 'yellow' });
  b('h3', 'Review ritual');
  b('todo', 'Within 24 hours: cover the notes, answer the cues aloud');
  b('todo', 'Ten minutes, twice this week — recite, don’t reread');
  b('todo', 'Before the exam: re-test from cues only');
  return id;
}

// ─── Gallery export ───────────────────────────────────────────────────────────

export const TEMPLATES: TemplateDef[] = [
  {
    id: 'meeting-notes', name: 'Meeting Notes', icon: '📋', category: 'Work',
    desc: 'Agenda, decisions, and owned action items — meetings that end on time.',
    create: createMeetingNotes,
  },
  {
    id: 'project-tracker', name: 'Project Tracker', icon: '🎯', category: 'Work',
    desc: 'A board, table, and timeline over one database of everything in flight.',
    create: createProjectTracker,
  },
  {
    id: 'okrs', name: 'OKRs', icon: '🧭', category: 'Work',
    desc: 'Quarterly objectives with scored key results — a compass, not a contract.',
    create: createOKRs,
  },
  {
    id: 'content-calendar', name: 'Content Calendar', icon: '📅', category: 'Work',
    desc: 'Publish on rhythm: a calendar of posts across every channel.',
    create: createContentCalendar,
  },
  {
    id: 'weekly-planner', name: 'Weekly Planner', icon: '🗓️', category: 'Personal',
    desc: 'The week at a glance — three columns, a habit line, and your wins.',
    create: createWeeklyPlanner,
  },
  {
    id: 'daily-journal', name: 'Daily Journal', icon: '✍️', category: 'Personal',
    desc: 'Gratitude, intention, the day’s log, and an evening reflection.',
    create: createDailyJournal,
  },
  {
    id: 'habit-tracker', name: 'Habit Tracker', icon: '✅', category: 'Personal',
    desc: 'Tick the day, keep the chain — seven checkboxes and a streak.',
    create: createHabitTracker,
  },
  {
    id: 'travel-planner', name: 'Travel Planner', icon: '✈️', category: 'Personal',
    desc: 'Itinerary, packing, budget, bookings — wander with a spine.',
    create: createTravelPlanner,
  },
  {
    id: 'reading-list', name: 'Reading List', icon: '📚', category: 'Knowledge',
    desc: 'A gallery shelf of books with ratings and one-line verdicts.',
    create: createReadingList,
  },
  {
    id: 'cornell-notes', name: 'Cornell Notes', icon: '🎓', category: 'Knowledge',
    desc: 'Cues, notes, summary — the 1949 study method, ready to fill.',
    create: createCornellNotes,
  },
];
