import type { JurisdictionId } from "@civy/types";
import { describe, expect, it } from "vitest";
import { SUPPORTED_JURISDICTIONS } from "./jurisdictions";

describe("SUPPORTED_JURISDICTIONS", () => {
  it("always includes federal", () => {
    const federal: JurisdictionId = "federal";
    expect(SUPPORTED_JURISDICTIONS).toContain(federal);
  });

  it("includes Maine at launch", () => {
    expect(SUPPORTED_JURISDICTIONS).toContain("us-me");
  });
});
