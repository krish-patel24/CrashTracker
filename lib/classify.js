// Classifies each crash as 'serious' or 'standard' for the sidebar's
// "Serious incidents only" filter. This is intentionally broad and
// keyword-based, on purpose: it's a safety net, not a headline generator —
// unlike the featured-story rotation, being a little over-inclusive here is
// the safe direction to err in, since the goal is "never quietly hide a
// serious report," not "pick exactly the right five."
//
// Report severity should already come from the row's own severity field
// (see classifySeverity in fetchCrashes.js), but that depends on correctly
// guessing hermai's real column name — if that guess is wrong, or the field
// uses wording we didn't anticipate, this narrative-text check is the
// backstop that still catches it.
const SERIOUS_NARRATIVE_KEYWORDS = [
  'pedestrian', 'cyclist', 'bicyclist', 'bike rider', 'motorcyclist', 'scooter rider',
  'hospital', 'transported', 'transport for evaluation', 'ambulance',
  'emergency room', 'paramedic', 'injury', 'injured', 'minor injury'
];

const STOPPED_MOVEMENT_KEYWORDS = ['stopped', 'parked', 'stationary', 'standing'];

function matchesAny(text, keywords) {
  const lower = (text || '').toLowerCase();
  return keywords.some(k => lower.includes(k));
}

// severity: 'fatality' | 'injury' | 'damage' (from classifySeverity)
export function classifyStory({ severity, narrative }) {
  if (severity === 'fatality' || severity === 'injury') return 'serious';
  if (matchesAny(narrative, SERIOUS_NARRATIVE_KEYWORDS)) return 'serious';
  return 'standard';
}

export function isStoppedOrParked(movement) {
  return matchesAny(movement, STOPPED_MOVEMENT_KEYWORDS);
}
