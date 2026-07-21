/**
 * Every bill belongs to exactly one jurisdiction: `federal` or a US state
 * (PRD §5). New states are meant to be additive — the seam is the
 * `US_STATE_CODES` tuple below: append a code and the `UsStateCode` union
 * (and everything derived from it) widens automatically, no type rewrites.
 * Maine is the only state enabled at launch.
 */
export const US_STATE_CODES = ["us-me"] as const;

/** A US state jurisdiction code, e.g. `"us-me"`. Derived from the registry. */
export type UsStateCode = (typeof US_STATE_CODES)[number];

/** The identifier for a jurisdiction: federal, or a specific US state. */
export type JurisdictionId = "federal" | UsStateCode;

/**
 * The jurisdictions Civy operates on: `federal` plus every code in the state
 * registry. This is the single source of truth — derived from `US_STATE_CODES`,
 * so enabling a state stays a one-line change to the registry and this list
 * follows automatically. Apps re-export it rather than maintaining their own.
 */
export const JURISDICTION_IDS = [
  "federal",
  ...US_STATE_CODES,
] as const satisfies readonly JurisdictionId[];

/** Which legislative body a bill originates in. */
export type Chamber = "house" | "senate";

/** The level of government a jurisdiction represents. */
export type JurisdictionLevel = "federal" | "state";

/** A jurisdiction whose legislation Civy tracks. */
export interface Jurisdiction {
  /** Stable identifier used throughout the app (`federal`, `us-me`, …). */
  id: JurisdictionId;
  /** Human-readable name, e.g. "Maine" or "United States Congress". */
  name: string;
  level: JurisdictionLevel;
  /** Chambers this jurisdiction's legislature is composed of. */
  chambers: Chamber[];
}
