import type { JurisdictionId } from "@civy/types";

/**
 * Jurisdictions the worker ingests legislation for. Federal (Congress.gov) plus
 * the states wired to an Open States source adapter — Maine at launch. Adding a
 * state to `@civy/types` and an adapter entry here is all it takes to enable it.
 */
export const INGESTED_JURISDICTIONS = [
  "federal",
  "us-me",
] as const satisfies readonly JurisdictionId[];
