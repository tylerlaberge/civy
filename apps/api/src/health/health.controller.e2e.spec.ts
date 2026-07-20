import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { configureApp } from "../app.setup";

// Matches the CORS_ORIGIN default in src/config/env.validation.ts, which
// configureApp reads from ConfigService.
const CORS_ORIGIN = "http://localhost:4321";

describe("Health (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    // Same setup main.ts applies, so tests exercise the real global config.
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /health returns 200 with status and uptime", async () => {
    const response = await request(app.getHttpServer()).get("/health");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
    expect(typeof response.body.uptime).toBe("number");
    expect(typeof response.body.timestamp).toBe("string");
  });

  it("returns the consistent error shape for unknown routes", async () => {
    const response = await request(app.getHttpServer()).get("/does-not-exist");

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      statusCode: 404,
      error: expect.any(String),
      message: expect.anything(),
      path: "/does-not-exist",
      timestamp: expect.any(String),
    });
  });

  it("allows the configured CORS origin", async () => {
    const response = await request(app.getHttpServer()).get("/health").set("Origin", CORS_ORIGIN);

    expect(response.headers["access-control-allow-origin"]).toBe(CORS_ORIGIN);
  });

  it("does not echo a disallowed CORS origin", async () => {
    const response = await request(app.getHttpServer())
      .get("/health")
      .set("Origin", "http://evil.example");

    // A single configured origin must not be reflected back for other origins.
    expect(response.headers["access-control-allow-origin"]).not.toBe("http://evil.example");
  });
});
