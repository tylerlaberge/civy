/**
 * The API's surface onto the shared jurisdiction registry (federal plus every
 * state code Civy tracks). Re-exported from `@civy/types` — which owns the
 * single source of truth — so the API never maintains its own copy, and so this
 * app genuinely resolves the shared package under the Nest toolchain.
 */
export { JURISDICTION_IDS } from "@civy/types";
