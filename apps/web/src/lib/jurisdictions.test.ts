import type { JurisdictionId } from "@civy/types";
import { describe, expect, it } from "vitest";
import { JURISDICTION_LABELS } from "./jurisdictions.js";

describe("JURISDICTION_LABELS", () => {
  it("labels the federal jurisdiction and Maine", () => {
    const federal: JurisdictionId = "federal";
    expect(JURISDICTION_LABELS[federal]).toBe("Congress");
    expect(JURISDICTION_LABELS["us-me"]).toBe("Maine");
  });
});
