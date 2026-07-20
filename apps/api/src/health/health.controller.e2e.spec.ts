import type { INestApplication } from "@nestjs/common";
import { ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { AllExceptionsFilter } from "../common/filters/all-exceptions.filter";

const CORS_ORIGIN = "http://localhost:4321";

describe("Health (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    // Mirror main.ts so the tests exercise the real global config.
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    app.enableCors({ origin: CORS_ORIGIN, credentials: true });
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
});
