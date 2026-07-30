// Explicit allowlist for the "You would never guess these count as robotaxi
// crashes" rotation. Deliberately NOT keyword-matched — an earlier version
// auto-detected "notable" stories by scanning narrative text for object
// keywords, which grabbed the wrong report often enough to be a real
// accuracy bug (e.g. a tape-measure report got mislabeled "A loose tire"
// because "tire" appeared elsewhere in the narrative). Only report IDs
// listed here, with headlines confirmed against the actual narrative, ever
// appear in the featured rotation. Add new entries only after reading the
// real narrative for that report ID.
export const FEATURED_STORIES = {
  '30270-13607': 'Traffic cone thrown from a pickup',
  '30270-13665': 'Suitcase fell from an SUV',
  '30270-14661': 'Tape measure stretched across the road',
  '30270-15194': 'Camping trailer rolled downhill',
  '30270-15290': 'Spare tire fell from a motorhome'
};
