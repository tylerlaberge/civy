import type { JurisdictionId } from "@civy/types";

/**
 * Jurisdictions the API currently serves. Federal is always available; states
 * come online as ingestion is enabled (Maine first). Kept here as the API's
 * view of the shared jurisdiction model until the db package owns it.
 *
 * `satisfies` checks membership, not exhaustiveness — deliberately. A state can
 * exist in `@civy/types` before the API serves it, so adding a code to
 * `US_STATE_CODES` must not force this list to claim readiness. This list is
 * maintained by hand as jurisdictions actually come online.
 *
 * This intentionally parallels — but stays independent of — the worker's
 * `INGESTED_JURISDICTIONS`. They coincide today; keep them separate so serving
 * and ingestion can diverge as each rolls out.
 */
export const SUPPORTED_JURISDICTIONS = [
  "federal",
  "us-me",
] as const satisfies readonly JurisdictionId[];
