import type { JurisdictionId } from "@civy/types";

/**
 * Jurisdictions the API currently serves. Federal is always available; states
 * come online as ingestion is enabled (Maine first). Kept here as the API's
 * view of the shared jurisdiction model until the db package owns it.
 */
export const SUPPORTED_JURISDICTIONS = [
  "federal",
  "us-me",
] as const satisfies readonly JurisdictionId[];
