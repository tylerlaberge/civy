import { describe, expect, it } from "vitest";
import { validate } from "./env.validation";

describe("validate (env)", () => {
  it("applies defaults when no vars are provided", () => {
    const config = validate({});
    expect(config.REDIS_URL).toBe("redis://localhost:6379");
    expect(config.DATABASE_PATH).toBe("./data/civy.sqlite");
  });

  it("accepts valid values", () => {
    const config = validate({
      REDIS_URL: "rediss://cache.internal:6380",
      DATABASE_PATH: "/data/app.sqlite",
    });
    expect(config.REDIS_URL).toBe("rediss://cache.internal:6380");
    expect(config.DATABASE_PATH).toBe("/data/app.sqlite");
  });

  it("throws when REDIS_URL is not a redis URL", () => {
    expect(() => validate({ REDIS_URL: "http://localhost:6379" })).toThrow(
      /Invalid environment configuration/,
    );
  });

  it("throws when REDIS_URL is not a URL at all", () => {
    expect(() => validate({ REDIS_URL: "not a url" })).toThrow(/Invalid environment configuration/);
  });
});
