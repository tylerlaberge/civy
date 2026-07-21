import { describe, expect, it } from "vitest";
import { JURISDICTION_IDS } from "./jurisdictions";

describe("api jurisdictions", () => {
  it("surfaces federal and Maine from the shared registry", () => {
    expect(JURISDICTION_IDS).toEqual(["federal", "us-me"]);
  });
});
