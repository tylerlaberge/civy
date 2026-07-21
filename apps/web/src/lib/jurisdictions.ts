import type { JurisdictionId } from "@civy/types";

/**
 * Display labels for each jurisdiction the UI can show. Typing this as a
 * `Record<JurisdictionId, string>` makes it exhaustive: enabling a new state in
 * `@civy/types` forces a label to be added here, so the UI can never render an
 * unlabeled jurisdiction.
 */
export const JURISDICTION_LABELS = {
  federal: "Congress",
  "us-me": "Maine",
} as const satisfies Record<JurisdictionId, string>;
