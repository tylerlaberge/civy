import { describe, expect, it } from "vitest";
import { validate } from "./env.validation";

describe("validate (env)", () => {
  it("applies defaults when no vars are provided", () => {
    const config = validate({});
    expect(config.PORT).toBe(3000);
    expect(config.DATABASE_PATH).toBe("./data/civy.sqlite");
    expect(config.CORS_ORIGIN).toBe("http://localhost:4321");
  });

  it("coerces and accepts valid values", () => {
    const config = validate({
      PORT: "8080",
      DATABASE_PATH: "/data/app.sqlite",
      CORS_ORIGIN: "http://localhost:3001",
    });
    expect(config.PORT).toBe(8080);
    expect(config.DATABASE_PATH).toBe("/data/app.sqlite");
    expect(config.CORS_ORIGIN).toBe("http://localhost:3001");
  });

  it("throws when PORT is not a number", () => {
    expect(() => validate({ PORT: "not-a-port" })).toThrow(/Invalid environment configuration/);
  });

  it("throws when PORT is out of range", () => {
    expect(() => validate({ PORT: "70000" })).toThrow(/Invalid environment configuration/);
  });

  it("throws when CORS_ORIGIN is not a URL", () => {
    expect(() => validate({ CORS_ORIGIN: "not a url" })).toThrow(
      /Invalid environment configuration/,
    );
  });
});
