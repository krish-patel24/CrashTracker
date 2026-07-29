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

// Preferred path: the SGO filing itself usually names who's actually running
// the vehicle. Make alone is unreliable — some Toyota (and other) chassis are
// operated by Zoox, Nuro, etc., so a Make-only mapping misattributes those.
// Order of trust: Operating Entity > Reporting Entity > Make-based guess.
export function resolveOperator({ operatingEntity, reportingEntity, make }) {
  const operating = (operatingEntity || '').trim();
  if (operating) return operating;

  const reporting = (reportingEntity || '').trim();
  if (reporting) return reporting;

  return operatorFromMake(make);
}
