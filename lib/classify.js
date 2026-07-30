// Classifies each crash into a bucket used for the "you'd never guess" feature
// vs. the serious-incidents view. This runs against whatever narrative text
// hermai actually returns — it does not invent or assume any specific
// incidents exist; it just flags patterns if/when they're present in the
// real feed.

// Anything matching these, in the narrative, always gets treated as serious
// regardless of what else is in the text — pedestrians/cyclists/motorcyclists
// involved in a crash are never "entertainment," even if the damage was minor.
const SERIOUS_NARRATIVE_KEYWORDS = [
  'pedestrian', 'cyclist', 'bicyclist', 'bike rider', 'motorcyclist', 'scooter rider'
];

// Loose, oddball objects in the roadway — the kind of thing that reads as
// surprising precisely because it has nothing to do with the robotaxi's own
// driving. Order matters: more specific phrases are checked before their
// shorter substrings (e.g. "spare tire" before "tire"), both for matching
// and for picking the right headline phrase below. Tune against real data.
const NOTABLE_KEYWORD_PHRASES = [
  ['traffic cone', 'A traffic cone in the roadway'],
  ['cone', 'A traffic cone in the roadway'],
  ['suitcase', 'A suitcase in the roadway'],
  ['luggage', 'Luggage in the roadway'],
  ['camping trailer', 'A runaway camping trailer'],
  ['trailer', 'A runaway trailer'],
  ['spare tire', 'A loose spare tire'],
  ['tire', 'A loose tire'],
  ['tape measure', "A construction worker's tape measure"],
  ['mattress', 'A mattress in the roadway'],
  ['ladder', 'A ladder in the roadway'],
  ['shopping cart', 'A shopping cart in the roadway'],
  ['lawn chair', 'A lawn chair in the roadway'],
  ['couch', 'A couch in the roadway'],
  ['furniture', 'Furniture in the roadway'],
  ['umbrella', 'An umbrella in the roadway'],
  ['tarp', 'A loose tarp'],
  ['cardboard', 'Cardboard in the roadway'],
  ['debris', 'Road debris'],
  ['lumber', 'Lumber in the roadway'],
  ['plywood', 'Plywood in the roadway'],
  ['chair', 'A chair in the roadway'],
  ['cooler', 'A cooler in the roadway'],
  ['skateboard', 'A skateboard in the roadway']
];

const STOPPED_MOVEMENT_KEYWORDS = ['stopped', 'parked', 'stationary', 'standing'];

function matchesAny(text, keywords) {
  const lower = (text || '').toLowerCase();
  return keywords.some(k => lower.includes(k));
}

function findNotableMatch(narrative) {
  const lower = (narrative || '').toLowerCase();
  return NOTABLE_KEYWORD_PHRASES.find(([keyword]) => lower.includes(keyword)) || null;
}

// severity: 'fatality' | 'injury' | 'damage' (from classifySeverity)
export function classifyStory({ severity, narrative }) {
  if (severity === 'fatality' || severity === 'injury') return 'serious';
  if (matchesAny(narrative, SERIOUS_NARRATIVE_KEYWORDS)) return 'serious';
  if (findNotableMatch(narrative)) return 'notable';
  return 'standard';
}

export function isStoppedOrParked(movement) {
  return matchesAny(movement, STOPPED_MOVEMENT_KEYWORDS);
}

// Headline generation. NHTSA narratives share a repetitive boilerplate opener
// ("On [date] at [time] a [Operator] Autonomous Vehicle ... operating in ...")
// so truncating the first sentence just cuts that boilerplate off mid-word.
// For notable stories, use a short fixed phrase tied to whichever object
// keyword actually matched — factual, not fabricated, and never gets cut off.
// For anything else, fall back to a clean word-boundary truncation instead
// of a hard character cutoff.
export function generateHeadline({ narrative, story }) {
  if (story === 'notable') {
    const match = findNotableMatch(narrative);
    if (match) return match[1];
  }
  return wordBoundaryTruncate(narrative, 90);
}

function wordBoundaryTruncate(narrative, maxLen) {
  const clean = (narrative || '').trim();
  if (!clean) return 'Robotaxi crash report';
  if (clean.length <= maxLen) return clean;
  const cut = clean.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim() + '…';
}
