import type { Chamber, JurisdictionId } from "./jurisdiction.js";

/**
 * A bill's position in the legislative process. Kept coarse and
 * jurisdiction-agnostic so both Open States and Congress.gov statuses map
 * onto it; per-source strings are normalized into these buckets by adapters.
 */
export type BillStatus =
  | "introduced"
  | "in_committee"
  | "passed_chamber"
  | "passed_legislature"
  | "enacted"
  | "vetoed"
  | "failed";

/** A legislator sponsoring a bill. */
export interface Sponsor {
  /** Name as reported by the source. */
  name: string;
  /** Primary sponsor vs. co-sponsor. */
  isPrimary: boolean;
  /** Party affiliation, when the source provides it. */
  party?: string;
}

/**
 * One entry in a bill's status timeline. History is append-only and
 * deduplicated during ingestion (see CLAUDE.md: idempotent ingestion).
 */
export interface BillStatusHistoryEntry {
  status: BillStatus;
  /** When the bill entered this status (ISO 8601). */
  occurredAt: string;
  /** Optional human-readable description of the action. */
  note?: string;
}

/** A piece of legislation in one jurisdiction. */
export interface Bill {
  /** Civy's internal identifier. */
  id: string;
  jurisdictionId: JurisdictionId;
  /**
   * The source's stable identifier for the bill. Bills upsert on
   * `(jurisdictionId, externalId)`, so this must be stable across re-ingestion.
   */
  externalId: string;
  /** Human-facing bill number, e.g. "LD 1234" or "H.R. 5678". */
  identifier: string;
  title: string;
  /**
   * Summary/abstract; omitted until the source publishes one.
   *
   * Absent-value convention for the domain model: use optional (`?`) for values
   * that may simply not be present yet; reserve `| null` for a null that is
   * itself a meaningful, always-present value (see `Comment.parentId`).
   */
  summary?: string;
  chamber: Chamber;
  status: BillStatus;
  /** Link to the full text on the official source. */
  sourceUrl: string;
  /** Timestamps in ISO 8601. */
  createdAt: string;
  updatedAt: string;
}
