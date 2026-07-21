import { JURISDICTION_IDS as SHARED_JURISDICTION_IDS } from "@civy/types";
import { describe, expect, it } from "vitest";
import { JURISDICTION_IDS } from "./jurisdictions";

describe("api jurisdictions", () => {
  it("surfaces the shared jurisdiction registry", () => {
    expect(JURISDICTION_IDS).toEqual(SHARED_JURISDICTION_IDS);
  });

  it("includes federal and Maine", () => {
    expect(JURISDICTION_IDS).toContain("federal");
    expect(JURISDICTION_IDS).toContain("us-me");
  });
});
