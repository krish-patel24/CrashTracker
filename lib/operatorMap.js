// NHTSA's SGO data reports the vehicle Make, not the company operating it.
// Waymo's fleet runs on Jaguar I-PACE (and newer Zeekr) chassis, so we map
// those back to the operator that actually matters for the story.
const MAKE_TO_OPERATOR = [
  { match: 'JAGUAR', operator: 'Waymo' },
  { match: 'ZEEKR', operator: 'Waymo' },
  { match: 'ZOOX', operator: 'Zoox' }
];

export function operatorFromMake(make) {
  const key = (make || '').trim().toUpperCase();
  const hit = MAKE_TO_OPERATOR.find(entry => key.includes(entry.match));
  return hit ? hit.operator : 'Other';
}

// The Operating/Reporting Entity fields come back as free text from the
// filer — "Waymo LLC", "WAYMO", "Zoox, Inc." etc. — so an exact-string
// match against a clean name fails constantly. Normalize known operators
// to one canonical name; anything unrecognized passes through as-is
// (title-cased trimmed text) rather than getting silently dropped.
const KNOWN_OPERATORS = [
  { match: 'WAYMO', name: 'Waymo' },
  { match: 'ZOOX', name: 'Zoox' },
  { match: 'NURO', name: 'Nuro' },
  { match: 'WERIDE', name: 'WeRide' },
  { match: 'CRUISE', name: 'Cruise' },
  { match: 'AURORA', name: 'Aurora' }
];

function normalizeOperatorName(raw) {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  const key = trimmed.toUpperCase();
  const hit = KNOWN_OPERATORS.find(entry => key.includes(entry.match));
  return hit ? hit.name : trimmed;
}

// Preferred path: the SGO filing itself usually names who's actually running
// the vehicle. Make alone is unreliable — some Toyota (and other) chassis are
// operated by Zoox, Nuro, etc., so a Make-only mapping misattributes those.
// Order of trust: Operating Entity > Reporting Entity > Make-based guess.
export function resolveOperator({ operatingEntity, reportingEntity, make }) {
  const operating = normalizeOperatorName(operatingEntity);
  if (operating) return operating;

  const reporting = normalizeOperatorName(reportingEntity);
  if (reporting) return reporting;

  return operatorFromMake(make);
}
