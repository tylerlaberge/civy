import type { JurisdictionId } from "@civy/types";
import { describe, expect, it } from "vitest";
import { INGESTED_JURISDICTIONS } from "./jurisdictions";

describe("INGESTED_JURISDICTIONS", () => {
  it("always ingests federal legislation", () => {
    const federal: JurisdictionId = "federal";
    expect(INGESTED_JURISDICTIONS).toContain(federal);
  });

  it("ingests Maine at launch", () => {
    expect(INGESTED_JURISDICTIONS).toContain("us-me");
  });
});
