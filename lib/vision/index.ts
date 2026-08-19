export { binarize, flattenBackground, otsuThreshold, type GrayImage, type Mask } from "./binarize";
export { labelComponents, largestComponent, type Comp, type Labelled } from "./components";
export { BAR_BASES, countBars, countDots, DOT_BASES } from "./features";
export {
  bestMatch,
  CANON_H,
  CANON_W,
  canonicalPatch,
  HIGH_CONFIDENCE_MARGIN,
  loadTemplates,
  MIN_CORRELATION,
  MIN_MARGIN,
  normalise,
  type CareTemplate,
  type MatchResult,
  type TemplateBundle,
} from "./match";
export { countOnly, MIN_GLYPH_PX_FOR_BARS, readSymbol, type SymbolReading } from "./reader";
export { resolveReading, type Resolved } from "./resolve";
export { cropGray, segmentSymbols, type SegmentOptions, type SymbolBox } from "./segment";
