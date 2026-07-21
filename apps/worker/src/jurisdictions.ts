import type { JurisdictionId } from "@civy/types";

/**
 * Jurisdictions the worker ingests legislation for. Federal (Congress.gov) plus
 * the states wired to an Open States source adapter — Maine at launch.
 *
 * `satisfies` checks membership, not exhaustiveness — deliberately. A state can
 * exist in `@civy/types` before an adapter ingests it, so adding a code to
 * `US_STATE_CODES` must not force this list to claim readiness. Enabling a state
 * means adding it here alongside its adapter entry, by hand.
 *
 * This intentionally parallels — but stays independent of — the API's
 * `SUPPORTED_JURISDICTIONS`. They coincide today; keep them separate so serving
 * and ingestion can diverge as each rolls out.
 */
export const INGESTED_JURISDICTIONS = [
  "federal",
  "us-me",
] as const satisfies readonly JurisdictionId[];
