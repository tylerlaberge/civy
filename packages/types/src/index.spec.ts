import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  Bill,
  BillStatusHistoryEntry,
  Comment,
  Jurisdiction,
  JurisdictionId,
  Sponsor,
  User,
  UsStateCode,
} from "./index.js";
import { JURISDICTION_IDS, US_STATE_CODES } from "./index.js";

describe("jurisdiction registry", () => {
  it("enables Maine at launch", () => {
    expect(US_STATE_CODES).toContain("us-me");
  });

  it("derives UsStateCode from the registry tuple", () => {
    // The union is the tuple's element type — adding a code to US_STATE_CODES
    // is the only edit needed to enable a new state.
    expectTypeOf<UsStateCode>().toEqualTypeOf<(typeof US_STATE_CODES)[number]>();
  });

  it("accepts federal and state codes as a JurisdictionId", () => {
    expectTypeOf<"federal">().toMatchTypeOf<JurisdictionId>();
    expectTypeOf<"us-me">().toMatchTypeOf<JurisdictionId>();
  });

  it("lists federal plus every registry state code as JURISDICTION_IDS", () => {
    // Asserted against explicit literals, not re-derived from US_STATE_CODES —
    // spreading the registry here would make this pass by construction.
    expect(JURISDICTION_IDS).toEqual(["federal", "us-me"]);
  });

  it("models a jurisdiction with its chambers", () => {
    const maine: Jurisdiction = {
      id: "us-me",
      name: "Maine",
      level: "state",
      chambers: ["house", "senate"],
    };
    expect(maine.chambers).toHaveLength(2);
  });
});

describe("domain model shapes", () => {
  it("covers a bill with sponsors and status history", () => {
    const sponsor: Sponsor = { name: "Rep. Example", isPrimary: true };
    const history: BillStatusHistoryEntry = {
      status: "introduced",
      occurredAt: "2026-01-02T00:00:00.000Z",
    };
    const bill: Bill = {
      id: "bill-1",
      jurisdictionId: "us-me",
      externalId: "ocd-bill/abc",
      identifier: "LD 1234",
      title: "An Act To Do Something",
      chamber: "house",
      status: "in_committee",
      sponsors: [sponsor],
      statusHistory: [history, { status: "in_committee", occurredAt: "2026-01-03T00:00:00.000Z" }],
      sourceUrl: "https://legislature.maine.gov/LD1234",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-03T00:00:00.000Z",
    };

    expectTypeOf(bill.jurisdictionId).toEqualTypeOf<JurisdictionId>();
    expect(bill.identifier).toBe("LD 1234");
    // Sponsors and history hang off the bill, so a bill detail view (PRD §4.3)
    // is expressible from the domain model alone.
    expect(bill.sponsors[0]?.isPrimary).toBe(true);
    expect(bill.statusHistory.map((entry) => entry.status)).toEqual(["introduced", "in_committee"]);
    // Current status is the tip of the timeline.
    expect(bill.statusHistory.at(-1)?.status).toBe(bill.status);
  });

  it("models a user whose home state drives comment rights", () => {
    const user: User = {
      id: "user-1",
      email: "resident@example.com",
      homeState: "us-me",
      role: "member",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    // Home state is a US state code, never `federal`.
    expectTypeOf(user.homeState).toEqualTypeOf<UsStateCode>();
    expect(user.homeState).toBe("us-me");
  });

  it("threads comments via parentId", () => {
    const top: Comment = {
      id: "c-1",
      billId: "bill-1",
      authorId: "user-1",
      body: "Top-level comment",
      parentId: null,
      createdAt: "2026-01-04T00:00:00.000Z",
    };
    const reply: Comment = {
      ...top,
      id: "c-2",
      body: "A reply",
      parentId: top.id,
    };
    expect(top.parentId).toBeNull();
    expect(reply.parentId).toBe(top.id);
  });
});
