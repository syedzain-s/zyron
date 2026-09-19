/**
 * Mood Check-in — the wellness half of the BIO module.
 *
 * Three things this file is careful about, and a reviewer should know why:
 *
 * 1. It reads a face as a *guess*, never a diagnosis. Facial expression and
 *    felt emotion are not the same thing, so every reading is offered back to
 *    the person for confirmation before anything is suggested.
 *
 * 2. The techniques are drawn from ordinary, well-established self-help
 *    practice — paced breathing, sensory grounding, behavioural activation,
 *    self-compassion. Nothing here uses physical discomfort as a coping
 *    strategy; those reinforce the thing they claim to interrupt.
 *
 * 3. It has a floor. If the signals suggest real distress rather than a rough
 *    afternoon, the flow stops offering activities and offers support instead.
 *    A tool that answers a crisis with a breathing exercise is worse than one
 *    that says nothing.
 *
 * 4. Audio comes in two kinds. Ambient sound is synthesised in the browser —
 *    nothing licensed, nothing streamed. Quran recitation is streamed from a
 *    public recitation CDN, credited to the reciter, and offered as one option
 *    among several, never pushed.
 */

export type Mood =
  | 'calm'
  | 'tense'
  | 'anxious'
  | 'low'
  | 'flat'
  | 'irritable'
  | 'tired'
  | 'bright';

export type TechniqueKind =
  | 'breathing'
  | 'grounding'
  | 'cognitive'
  | 'behavioural'
  | 'movement'
  | 'connection'
  | 'playful';

export interface Technique {
  id: string;
  title: string;
  /** One line the person reads before deciding. */
  promise: string;
  kind: TechniqueKind;
  /** Rough minutes. Kept small — nobody in distress starts a 20-minute thing. */
  minutes: number;
  steps: string[];
  /** Why this is worth doing, in plain language. No jargon, no citations. */
  why: string;
  moods: Mood[];
  /** Drives the guided pacer in the UI. */
  pacer?: { inhale: number; hold: number; exhale: number; holdOut: number; cycles: number };
}

export type SoundRecipe = 'brown-noise' | 'rain' | 'warm-hum' | 'ocean' | 'soft-chimes' | 'stream';

export interface Soundscape {
  id: string;
  title: string;
  blurb: string;
  /** Synthesised in the browser, or 'stream' for a hosted recording. */
  recipe: SoundRecipe;
  /** Only for 'stream'. */
  url?: string;
  /** Shown under the title: who is reciting, or "ambient". */
  category: 'quran' | 'ambient';
  moods: Mood[];
}

/* ───────────────────────── Mood definitions ───────────────────────── */

export const MOODS: Record<Mood, { label: string; reading: string }> = {
  calm: { label: 'Calm', reading: 'You look settled.' },
  bright: { label: 'Bright', reading: 'You look genuinely up.' },
  tense: { label: 'Tense', reading: 'You look wound tight — jaw, shoulders, brow.' },
  anxious: { label: 'Anxious', reading: 'You look like your mind is running ahead of you.' },
  low: { label: 'Low', reading: 'You look heavy today.' },
  flat: { label: 'Flat', reading: 'You look switched off rather than sad.' },
  irritable: { label: 'Irritable', reading: 'You look like something is grating on you.' },
  tired: { label: 'Tired', reading: 'You look like you are running on empty.' },
};

/* ───────────────────────── The technique catalogue ───────────────────────── */

export const TECHNIQUES: Technique[] = [
  {
    id: 'physiological-sigh',
    title: 'Double breath, long release',
    promise: 'The fastest way down from a spike. Under a minute.',
    kind: 'breathing',
    minutes: 1,
    steps: [
      'Breathe in through your nose until your chest is full.',
      'Without breathing out, take one more short sip of air on top.',
      'Let it all go slowly through your mouth, longer than the way in.',
      'Repeat three times, then breathe normally and notice the difference.',
    ],
    why: 'A long out-breath is the one part of your stress response you can steer directly. Two inhales stacked open the lungs; the slow exhale is what actually brings the dial down.',
    moods: ['tense', 'anxious', 'irritable'],
    pacer: { inhale: 3, hold: 1, exhale: 6, holdOut: 0, cycles: 5 },
  },
  {
    id: 'box-breathing',
    title: 'Four-square breathing',
    promise: 'A steady rhythm to hold on to when your thoughts will not sit still.',
    kind: 'breathing',
    minutes: 3,
    steps: [
      'In through the nose for four.',
      'Hold for four.',
      'Out through the mouth for four.',
      'Hold empty for four. Repeat.',
    ],
    why: 'Counting gives your attention a simple job. The even rhythm stops the shallow, quick breathing that keeps anxiety topped up.',
    moods: ['anxious', 'tense', 'irritable'],
    pacer: { inhale: 4, hold: 4, exhale: 4, holdOut: 4, cycles: 6 },
  },
  {
    id: 'four-seven-eight',
    title: 'Four, seven, eight',
    promise: 'The one to do lying down. It leans toward sleep.',
    kind: 'breathing',
    minutes: 2,
    steps: [
      'In through the nose for four.',
      'Hold for seven.',
      'Out through the mouth, slowly, for eight.',
      'Four rounds. No more the first time.',
    ],
    why: 'The long hold and longer exhale tip the body toward rest rather than alertness. It is the breathing pattern for winding down, not for a meeting.',
    moods: ['tired', 'tense', 'anxious'],
    pacer: { inhale: 4, hold: 7, exhale: 8, holdOut: 0, cycles: 4 },
  },
  {
    id: 'five-senses',
    title: 'Five things you can see',
    promise: 'Pulls you out of your head and back into the room.',
    kind: 'grounding',
    minutes: 3,
    steps: [
      'Name five things you can see. Say them out loud if you can.',
      'Four things you can physically feel — chair, floor, fabric, air.',
      'Three things you can hear.',
      'Two things you can smell.',
      'One thing you can taste.',
    ],
    why: 'Anxiety lives in the future. Your senses only work in the present, so using them deliberately is the shortest route back.',
    moods: ['anxious', 'tense'],
  },
  {
    id: 'name-the-thought',
    title: 'Name the thought',
    promise: 'Puts a little distance between you and the loop.',
    kind: 'cognitive',
    minutes: 4,
    steps: [
      'Write down the sentence going around your head. The exact words.',
      'Now put "I am having the thought that…" in front of it and read it again.',
      'Ask one question: if a friend said this to me, what would I actually say back?',
      'Write that reply down.',
    ],
    why: 'You cannot argue a thought away, but you can stop standing inside it. Naming it turns it from a fact into a sentence you are having.',
    moods: ['anxious', 'low', 'irritable'],
  },
  {
    id: 'worry-window',
    title: 'Postpone the worry',
    promise: 'For the thing you cannot stop chewing on.',
    kind: 'cognitive',
    minutes: 2,
    steps: [
      'Write the worry down in one line.',
      'Pick a time later today — fifteen minutes, a specific slot.',
      'Tell yourself: not now, then. Put the note away.',
      'When the thought comes back, remind it that it has an appointment.',
    ],
    why: 'Trying not to think about something makes it louder. Giving it a scheduled slot is a deal your mind will usually accept.',
    moods: ['anxious', 'tense'],
  },
  {
    id: 'smallest-step',
    title: 'The two-minute version',
    promise: 'For when everything feels too heavy to start.',
    kind: 'behavioural',
    minutes: 2,
    steps: [
      'Pick the thing you have been avoiding.',
      'Shrink it until it takes two minutes. Not the essay — one paragraph. Not the room — one surface.',
      'Do only that. Stop when the two minutes are up, even if you want to keep going.',
    ],
    why: 'When mood is low, motivation arrives after action, not before it. Waiting to feel like it is waiting for the wrong thing.',
    moods: ['low', 'flat', 'tired'],
  },
  {
    id: 'three-good-things',
    title: 'Three specific things',
    promise: 'Not forced positivity. Specific, small, true.',
    kind: 'cognitive',
    minutes: 4,
    steps: [
      'Write three things from today that were fine or better. Small counts.',
      'For each one, write one line on what you did that helped it happen.',
      'That second line is the point — read it back.',
    ],
    why: 'Low mood filters out the ordinary good. Writing specifics rather than "be grateful" makes it harder for the filter to work.',
    moods: ['low', 'flat'],
  },
  {
    id: 'self-compassion',
    title: 'What you would tell a friend',
    promise: 'For when the voice in your head has turned on you.',
    kind: 'cognitive',
    minutes: 4,
    steps: [
      'Say what you are being hard on yourself about, in one sentence.',
      'Add: "this is difficult, and difficulty is not a personal failing."',
      'Write what you would say to a friend in the same position, word for word.',
      'Read it back as if it were addressed to you. Because it is.',
    ],
    why: 'People are reliably kinder and more accurate about others than about themselves. Borrowing that voice gets you a fairer reading.',
    moods: ['low', 'flat', 'tired'],
  },
  {
    id: 'movement-snack',
    title: 'Six minutes outside',
    promise: 'The cheapest reset there is.',
    kind: 'movement',
    minutes: 6,
    steps: [
      'Stand up. Put your phone down or leave it face down.',
      'Go outside, or to a window with daylight.',
      'Walk at a comfortable pace for six minutes. No podcast, no scrolling.',
      'Come back and notice whether anything shifted.',
    ],
    why: 'Light movement and daylight both nudge mood, and neither asks anything of you. It is the lowest-effort thing on this list that reliably does something.',
    moods: ['low', 'flat', 'tired', 'irritable', 'tense'],
  },
  {
    id: 'unclench',
    title: 'Release from the top down',
    promise: 'You are probably holding your jaw right now.',
    kind: 'grounding',
    minutes: 5,
    steps: [
      'Start at your forehead. Tense it for five seconds, then let go completely.',
      'Jaw next. Then shoulders, then hands, then stomach, then legs.',
      'Each one: squeeze, hold, release, and notice the difference.',
    ],
    why: 'Stress parks itself in muscle before you notice it in your head. Tensing first makes the release obvious enough to actually feel.',
    moods: ['tense', 'irritable', 'anxious', 'tired'],
  },
  {
    id: 'one-message',
    title: 'Message one person',
    promise: 'Not a conversation. One message.',
    kind: 'connection',
    minutes: 3,
    steps: [
      'Pick someone you have not spoken to in a while.',
      'Send one honest line. Not "how are you" — something real and small.',
      'Put the phone down. A reply is a bonus, not the point.',
    ],
    why: 'Low mood pulls you inward and then tells you that reaching out is a burden. It is usually wrong, and one line is a small enough test to run.',
    moods: ['low', 'flat'],
  },
  {
    id: 'shake-it-off',
    title: 'Ninety seconds of nonsense',
    promise: 'Undignified, and it works.',
    kind: 'playful',
    minutes: 2,
    steps: [
      'Stand up where nobody can see you.',
      'Shake out your hands, then arms, then shoulders, then legs. Properly.',
      'Add the silliest song you know, out loud, for one chorus.',
      'Sit back down.',
    ],
    why: 'Animals literally shake off stress and then carry on. It interrupts the loop, and the mild embarrassment is part of what breaks the spell.',
    moods: ['flat', 'low', 'irritable', 'tense'],
  },
  {
    id: 'ten-minute-tidy',
    title: 'Clear one surface',
    promise: 'One surface. Not the room.',
    kind: 'behavioural',
    minutes: 8,
    steps: [
      'Pick the smallest cluttered surface in sight — a desk corner, one shelf.',
      'Set a timer for eight minutes.',
      'Clear only that. Stop when the timer goes.',
    ],
    why: 'A finished small thing is proof that effort still produces results, which is exactly the belief low mood takes away first.',
    moods: ['flat', 'low', 'tired'],
  },
  {
    id: 'keep-the-good',
    title: 'Bank this one',
    promise: 'For when you already feel good.',
    kind: 'cognitive',
    minutes: 3,
    steps: [
      'Write down what today felt like, in a few honest lines.',
      'Note what led up to it — sleep, people, work, weather.',
      'Save it. On a flat day, that note is data, not sentiment.',
    ],
    why: 'Good days pass unexamined. Recording what preceded them is how you find out what actually works for you rather than what is supposed to.',
    moods: ['bright', 'calm'],
  },
  {
    id: 'drop-the-shoulders',
    title: 'Drop the shoulders',
    promise: 'Sixty seconds. You will feel it in the neck first.',
    kind: 'grounding',
    minutes: 1,
    steps: [
      'Sit back. Let your shoulders fall as far as they go — further than feels natural.',
      'Unclench your jaw. Let the tongue rest on the floor of the mouth, teeth apart.',
      'Uncurl your fingers. Rest the hands palm-up on your thighs.',
      'Three slow breaths in that position. Notice which part tries to creep back up.',
    ],
    why: 'Tension holds a posture, and posture holds tension. Changing one changes the other — and this one is small enough to do in a meeting.',
    moods: ['tense', 'irritable'],
  },
  {
    id: 'one-line-pressure',
    title: 'Name the pressure in one line',
    promise: 'Tense is usually one thing pretending to be everything.',
    kind: 'cognitive',
    minutes: 3,
    steps: [
      'Write: "The thing actually pressing on me is…" and finish the sentence. One line only.',
      'Under it, write the very next physical action it needs — an email, a call, a file opened.',
      'Do that action now, or write the time you will.',
    ],
    why: 'Undifferentiated pressure has no edges, so it feels endless. A single sentence gives it edges, and a next action gives it an exit.',
    moods: ['tense', 'anxious'],
  },
  {
    id: 'control-circle',
    title: 'Inside the circle, outside the circle',
    promise: 'Sorts the worry into what is yours and what is not.',
    kind: 'cognitive',
    minutes: 5,
    steps: [
      'Draw a circle. Inside it, list what you can actually influence today.',
      'Outside it, everything else — other people, outcomes, the past.',
      'Pick one item from inside the circle and do something about it in the next hour.',
      'For the outside items, say out loud: "not mine to carry right now."',
    ],
    why: 'Most anxiety is effort spent on the outside of the circle. Moving that effort inside is the only place it pays back.',
    moods: ['anxious', 'tense'],
  },
  {
    id: 'slow-exhale-walk',
    title: 'Walk on the out-breath',
    promise: 'Movement and breathing, together, five minutes.',
    kind: 'movement',
    minutes: 5,
    steps: [
      'Walk anywhere — corridor, courtyard, street.',
      'Breathe in for three steps. Breathe out for five steps.',
      'Keep the count. When it slips, just pick it up again.',
      'Five minutes, then stop and stand still for three breaths.',
    ],
    why: 'The long exhale settles the nervous system; the walking keeps the mind from doubling back. Doing both at once beats either alone.',
    moods: ['anxious', 'tense', 'irritable'],
  },
  {
    id: 'daylight-and-water',
    title: 'Daylight and a glass of water',
    promise: 'The two things low mood makes you forget.',
    kind: 'behavioural',
    minutes: 4,
    steps: [
      'Drink a full glass of water. All of it.',
      'Open a window or step outside. Face the light for three minutes, eyes open, no phone.',
      'Come back. Rate how you feel out of ten — one number, no story.',
    ],
    why: 'Dehydration and dim light both drag mood down, and both are boringly easy to fix. Fix the boring things first.',
    moods: ['low', 'tired', 'flat'],
  },
  {
    id: 'make-something-small',
    title: 'Make one small thing',
    promise: 'Ten minutes of producing instead of consuming.',
    kind: 'playful',
    minutes: 10,
    steps: [
      'Pick one: a doodle, a 60-second voice note about your day, a photo of something ordinary, three lines of anything.',
      'Set a timer for ten minutes. Make it badly on purpose.',
      'Keep it. Do not judge it, do not share it unless you want to.',
    ],
    why: 'Flatness is the feeling of only taking in. Making anything, however small, switches the direction and that alone changes the texture of an hour.',
    moods: ['flat', 'low', 'bright'],
  },
  {
    id: 'pause-before-reply',
    title: 'Draft it, do not send it',
    promise: 'Say everything. Send nothing. Yet.',
    kind: 'cognitive',
    minutes: 5,
    steps: [
      'Write the reply you want to send, exactly as angry as you feel. Do not soften it.',
      'Close it. Twenty minutes minimum before you look again.',
      'When you come back, keep the one sentence that is actually true and delete the rest.',
    ],
    why: 'Irritation wants an outlet, not an audience. The draft gives it the outlet; the delay gives you back the choice of audience.',
    moods: ['irritable', 'tense'],
  },
  {
    id: 'what-pricked',
    title: 'What actually pricked you',
    promise: 'Irritation is rarely about the thing in front of you.',
    kind: 'cognitive',
    minutes: 3,
    steps: [
      'Ask: what happened in the last two hours that I have not dealt with?',
      'Ask: am I hungry, tired, or behind on something?',
      'Name the real one in a sentence. Then decide whether the person in front of you deserves any of it.',
    ],
    why: 'Most snappiness has a source an hour or two upstream. Finding it usually drains the charge without needing to fix anything.',
    moods: ['irritable'],
  },
  {
    id: 'physical-discharge',
    title: 'Twenty of anything',
    promise: 'Burn the charge off in the body, where it lives.',
    kind: 'movement',
    minutes: 3,
    steps: [
      'Twenty squats, or twenty push-ups against a wall, or twenty flights of stairs. Pick one.',
      'Go a little faster than comfortable. Breathe out hard on the effort.',
      'Stop. Hands on knees. Wait for the breathing to settle before you do anything else.',
    ],
    why: 'Anger is a body state before it is an opinion. Give the body the effort it is braced for and the opinion usually shrinks to size.',
    moods: ['irritable', 'tense'],
  },
  {
    id: 'power-nap',
    title: 'Twelve-minute nap',
    promise: 'Long enough to help, short enough not to hurt.',
    kind: 'behavioural',
    minutes: 12,
    steps: [
      'Set an alarm for twelve minutes. Not more — past twenty, you wake up worse.',
      'Lie down or lean back. Eyes closed. It does not matter whether you sleep.',
      'When the alarm goes, stand up straight away and drink some water.',
    ],
    why: 'A short rest clears the pressure that builds through a day without dropping you into deep sleep. It is the difference between a reset and a hangover.',
    moods: ['tired'],
  },
  {
    id: 'screens-down',
    title: 'Fifteen minutes, no screen',
    promise: 'Your eyes and your attention both need it.',
    kind: 'behavioural',
    minutes: 15,
    steps: [
      'Phone face down, laptop lid closed. Fifteen minutes.',
      'Look at something far away — a window, a corridor, the sky.',
      'Do one analogue thing: tidy, stretch, make tea, sit.',
    ],
    why: 'Tired is often screen-tired: near focus, blue light, and a feed that never ends. Fifteen minutes of distance does more than another coffee.',
    moods: ['tired', 'flat'],
  },
  {
    id: 'two-minute-stretch',
    title: 'Two-minute stretch',
    promise: 'Neck, back, hips. That is it.',
    kind: 'movement',
    minutes: 2,
    steps: [
      'Stand. Reach both arms up, then fold forward and hang for five breaths.',
      'Roll up slowly. Tilt the head to each side, ten seconds each.',
      'Hands on the lower back, gently arch. Five breaths.',
    ],
    why: 'Sitting compresses everything and tells the body it is done for the day. Two minutes of length tells it otherwise.',
    moods: ['tired', 'tense', 'flat'],
  },
  {
    id: 'focus-block',
    title: 'One task, twenty-five minutes',
    promise: 'Calm is the right state for this. Use it.',
    kind: 'behavioural',
    minutes: 25,
    steps: [
      'Pick the one task that matters most today. Write it at the top of a blank page.',
      'Timer for twenty-five minutes. Notifications off, one tab.',
      'When the timer goes, stop, even mid-sentence. Note where you got to.',
    ],
    why: 'A settled mind is rare and short-lived. Spending it on the hardest thing, not the easiest, is how you get the most out of it.',
    moods: ['calm', 'bright'],
  },
  {
    id: 'plan-tomorrow-three',
    title: 'Three things for tomorrow',
    promise: 'Decide now, so tomorrow-you does not have to.',
    kind: 'cognitive',
    minutes: 4,
    steps: [
      'Write the three things that, if done tomorrow, would make it a good day.',
      'Put the hardest one first.',
      'Write where and when you will start it. Close the note.',
    ],
    why: 'Decisions cost the most when you are tired or rushed. Making them while calm is a gift to the version of you who wakes up.',
    moods: ['calm', 'bright'],
  },
  {
    id: 'savour-it',
    title: 'Savour something ordinary',
    promise: 'Five minutes of paying attention on purpose.',
    kind: 'grounding',
    minutes: 5,
    steps: [
      'Pick one thing — a cup of tea, the view, a song, a chair.',
      'Give it your whole attention for five minutes. Notice three details you had not noticed.',
      'When your mind wanders, bring it back without comment.',
    ],
    why: 'Calm rarely gets noticed while it is happening; it is only missed later. Attending to it while it is here is how it becomes memorable, and repeatable.',
    moods: ['calm'],
  },
  {
    id: 'help-someone-small',
    title: 'One small favour',
    promise: 'Spend a little of the good on someone else.',
    kind: 'connection',
    minutes: 5,
    steps: [
      'Think of one person who has something on their plate right now.',
      'Do one small thing for them — a message, a file they need, a question answered, a task taken.',
      'Do not mention it. Let it be theirs.',
    ],
    why: 'A good mood spent on other people lasts longer than one spent on yourself. It is also the fastest way to make a calm day feel like a full one.',
    moods: ['calm', 'bright'],
  },
  {
    id: 'use-the-energy',
    title: 'Point it at the hardest thing',
    promise: 'You will not feel like this at four o\u2019clock.',
    kind: 'behavioural',
    minutes: 20,
    steps: [
      'Name the one thing you have been putting off.',
      'Start it now, while you feel like this. Twenty minutes minimum.',
      'Leave a note for yourself at the stopping point so re-entry is easy.',
    ],
    why: 'High energy is a window, not a state. It is easiest to open the heavy door while it is open, and hardest to regret having done so.',
    moods: ['bright'],
  },
  {
    id: 'send-appreciation',
    title: 'Tell someone they did well',
    promise: 'Specific, short, and sent.',
    kind: 'connection',
    minutes: 3,
    steps: [
      'Think of one person who did something good recently. Not a big thing.',
      'Write two lines: what they did, and what it made possible.',
      'Send it. No emoji required.',
    ],
    why: 'Appreciation is cheap to give and rarely given. A bright day is the easiest time to do it, and the effect lands on both ends.',
    moods: ['bright', 'calm'],
  },
  {
    id: 'capture-the-idea',
    title: 'Write the idea down properly',
    promise: 'Bright days have ideas. Most get lost by evening.',
    kind: 'cognitive',
    minutes: 6,
    steps: [
      'Whatever you keep thinking about today — write it out in full sentences.',
      'Add: why now, what it would take, what the first step is.',
      'Save it somewhere you will see it on a flat day.',
    ],
    why: 'Ideas that arrive on good days feel obvious, which is exactly why they go unrecorded. Written down, they survive the mood that made them.',
    moods: ['bright'],
  },
];

/* ───────────────────────── Sound ───────────────────────── */

/**
 * Quran recitation by Mishary Rashid Alafasy, streamed from the Islamic
 * Network CDN (cdn.islamic.network, the audio host behind alquran.cloud).
 * Surah files are whole surahs; the Ayat al-Kursi entry is a single ayah.
 */
const RECITER = 'ar.alafasy';
const surah = (n: number) => `https://cdn.islamic.network/quran/audio-surah/128/${RECITER}/${n}.mp3`;
const ayah = (globalNumber: number) => `https://cdn.islamic.network/quran/audio/128/${RECITER}/${globalNumber}.mp3`;

export const SOUNDSCAPES: Soundscape[] = [
  // ── Quran ──
  {
    id: 'quran-inshirah',
    title: 'Surah Al-Inshirah',
    blurb: '"With hardship comes ease." Eight verses, about a minute.',
    recipe: 'stream',
    url: surah(94),
    category: 'quran',
    moods: ['tense', 'low', 'flat', 'anxious'],
  },
  {
    id: 'quran-duha',
    title: 'Surah Ad-Duha',
    blurb: 'Revealed after a silence. For a heavy morning.',
    recipe: 'stream',
    url: surah(93),
    category: 'quran',
    moods: ['low', 'anxious', 'bright'],
  },
  {
    id: 'quran-rahman',
    title: 'Surah Ar-Rahman',
    blurb: 'Rhythmic and repeating. About twelve minutes.',
    recipe: 'stream',
    url: surah(55),
    category: 'quran',
    moods: ['tense', 'calm', 'flat'],
  },
  {
    id: 'quran-yasin',
    title: 'Surah Ya-Sin',
    blurb: 'Long enough to sit with. Around twenty minutes.',
    recipe: 'stream',
    url: surah(36),
    category: 'quran',
    moods: ['anxious', 'low'],
  },
  {
    id: 'quran-mulk',
    title: 'Surah Al-Mulk',
    blurb: 'Traditionally read before sleep. About seven minutes.',
    recipe: 'stream',
    url: surah(67),
    category: 'quran',
    moods: ['tired', 'calm'],
  },
  {
    id: 'quran-asr',
    title: 'Surah Al-Asr',
    blurb: 'Three verses on time and patience. Under a minute.',
    recipe: 'stream',
    url: surah(103),
    category: 'quran',
    moods: ['irritable', 'tense'],
  },
  {
    id: 'quran-ikhlas',
    title: 'Surah Al-Ikhlas',
    blurb: 'Four verses. The shortest way to reset.',
    recipe: 'stream',
    url: surah(112),
    category: 'quran',
    moods: ['irritable', 'anxious', 'tired'],
  },
  {
    id: 'quran-kursi',
    title: 'Ayat al-Kursi',
    blurb: 'One verse, often recited for protection and calm.',
    recipe: 'stream',
    url: ayah(262),
    category: 'quran',
    moods: ['anxious', 'tense', 'tired', 'low'],
  },
  {
    id: 'quran-fatiha',
    title: 'Surah Al-Fatiha',
    blurb: 'The opening. Seven verses.',
    recipe: 'stream',
    url: surah(1),
    category: 'quran',
    moods: ['calm', 'bright', 'tired'],
  },
  {
    id: 'quran-kawthar',
    title: 'Surah Al-Kawthar',
    blurb: 'Three verses of abundance. For a good day.',
    recipe: 'stream',
    url: surah(108),
    category: 'quran',
    moods: ['bright', 'calm'],
  },

  // ── Ambient (synthesised in the browser) ──
  {
    id: 'brown-noise',
    title: 'Brown noise',
    blurb: 'A deep, even wash. Good for a mind that will not settle.',
    recipe: 'brown-noise',
    category: 'ambient',
    moods: ['anxious', 'tense', 'irritable'],
  },
  {
    id: 'rain',
    title: 'Steady rain',
    blurb: 'Soft and irregular, the way real rain is.',
    recipe: 'rain',
    category: 'ambient',
    moods: ['low', 'flat', 'tired', 'anxious', 'irritable'],
  },
  {
    id: 'warm-hum',
    title: 'Warm hum',
    blurb: 'A low drone under everything. Almost not there.',
    recipe: 'warm-hum',
    category: 'ambient',
    moods: ['tense', 'tired', 'flat'],
  },
  {
    id: 'ocean',
    title: 'Slow surf',
    blurb: 'Long swells, roughly the pace of calm breathing.',
    recipe: 'ocean',
    category: 'ambient',
    moods: ['anxious', 'tense', 'calm', 'tired'],
  },
  {
    id: 'soft-chimes',
    title: 'Distant chimes',
    blurb: 'Occasional, unpredictable, quiet.',
    recipe: 'soft-chimes',
    category: 'ambient',
    moods: ['low', 'bright', 'calm', 'flat'],
  },
];

/* ───────────────────────── Selection ───────────────────────── */

export interface Suggestion {
  mood: Mood;
  reading: string;
  techniques: Technique[];
  soundscapes: Soundscape[];
}

/** How many activities to offer at once. Five is a menu; eight is homework. */
const OFFER = 5;

/**
 * Picks what to offer. `rejected` holds technique ids the person has already
 * said did not help — this session or in their history — so the second round
 * is never the first round again.
 *
 * The five are chosen for variety, not just fit: at most two of the same kind,
 * so nobody gets five breathing exercises in a row.
 */
export function suggestFor(mood: Mood, rejected: string[] = []): Suggestion {
  const skip = new Set(rejected);

  const matching = TECHNIQUES.filter((t) => t.moods.includes(mood) && !skip.has(t.id));

  // Lead with something that takes under three minutes. Anything longer is a
  // negotiation when someone already feels bad.
  const ordered = [...matching].sort((a, b) => a.minutes - b.minutes);

  const picked: Technique[] = [];
  const perKind = new Map<TechniqueKind, number>();
  for (const t of ordered) {
    if (picked.length >= OFFER) break;
    const n = perKind.get(t.kind) ?? 0;
    if (n >= 2) continue;
    perKind.set(t.kind, n + 1);
    picked.push(t);
  }
  // Fill from the remainder if the kind cap left gaps.
  for (const t of ordered) {
    if (picked.length >= OFFER) break;
    if (!picked.includes(t)) picked.push(t);
  }

  // If everything has been tried and rejected, widen rather than return empty.
  const techniques =
    picked.length > 0 ? picked : TECHNIQUES.filter((t) => !skip.has(t.id)).slice(0, OFFER);

  const quran = SOUNDSCAPES.filter((s) => s.category === 'quran' && s.moods.includes(mood)).slice(0, 3);
  const ambient = SOUNDSCAPES.filter((s) => s.category === 'ambient' && s.moods.includes(mood)).slice(0, 2);
  const sounds = [...quran, ...ambient];

  return {
    mood,
    reading: MOODS[mood].reading,
    techniques,
    soundscapes: sounds.length > 0 ? sounds : SOUNDSCAPES.slice(0, 3),
  };
}

/* ───────────────────────── Safety floor ───────────────────────── */

/**
 * Words that mean this is not a rough afternoon. Deliberately broad: a false
 * positive costs one extra screen, a false negative costs far more.
 */
const DISTRESS = [
  'kill myself', 'end my life', 'suicide', 'suicidal', 'want to die', 'better off dead',
  'self harm', 'self-harm', 'hurt myself', 'cutting myself', 'no reason to live',
  'cannot go on', "can't go on", 'give up on life', 'end it all',
];

export function needsSupport(text: string): boolean {
  const lower = text.toLowerCase();
  return DISTRESS.some((phrase) => lower.includes(phrase));
}

export const SUPPORT_MESSAGE = {
  title: 'This is bigger than an activity',
  body: 'What you have described sounds like more than a difficult day, and a breathing exercise is not the right answer to it. Please talk to someone — a doctor, a counsellor, or somebody you trust. If you are in immediate danger, contact your local emergency number.',
  note: 'ZYRON is a wellness tool. It is not a therapist and it is not a crisis service.',
};

/* ───────────────────────── Model prompt ───────────────────────── */

export const VISION_SYSTEM = `You help with a wellness check-in. You are shown one photo of a person who has chosen to share it.

Give a cautious, non-clinical read of how they *appear*. You are guessing from a single frame — a face is not a feeling, and you say so.

Never diagnose. Never mention medical or psychiatric terms. Never comment on appearance, attractiveness, weight, age, race or gender. Never identify the person.

Reply with JSON only, no markdown fence, no commentary:

{
  "mood": one of "calm" | "bright" | "tense" | "anxious" | "low" | "flat" | "irritable" | "tired",
  "confidence": 0.0 to 1.0,
  "observation": "one short sentence about what you noticed — posture, expression, eyes. Neutral and kind.",
  "question": "one short question inviting them to correct you"
}

If the photo has no clear face, or is too dark, set mood to "calm", confidence to 0, and say so in observation.`;

export interface VisionReading {
  mood: Mood;
  confidence: number;
  observation: string;
  question: string;
}

const VALID_MOODS = Object.keys(MOODS) as Mood[];

/** Models add fences and prose no matter what the prompt says. Survive it. */
export function parseVisionReading(raw: string): VisionReading | null {
  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) return null;

  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Partial<VisionReading>;
    if (!parsed.mood || !VALID_MOODS.includes(parsed.mood)) return null;

    return {
      mood: parsed.mood,
      confidence: clamp01(Number(parsed.confidence ?? 0.5)),
      observation: String(parsed.observation ?? '').slice(0, 240) || 'Hard to read from this photo.',
      question: String(parsed.question ?? '').slice(0, 160) || 'Does that sound about right?',
    };
  } catch {
    return null;
  }
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(Math.max(n, 0), 1) : 0.5);
