import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RedisService } from "./redis.service";

// Mock ioredis so tests never touch a real server. vi.hoisted exposes the mocks
// to the (hoisted) vi.mock factory below.
const { connectMock, quitMock, onMock, RedisMock } = vi.hoisted(() => {
  const connectMock = vi.fn();
  const quitMock = vi.fn();
  const onMock = vi.fn();
  const RedisMock = vi.fn(() => ({ connect: connectMock, quit: quitMock, on: onMock }));
  return { connectMock, quitMock, onMock, RedisMock };
});

vi.mock("ioredis", () => ({ Redis: RedisMock }));

async function buildModule(): Promise<TestingModule> {
  return Test.createTestingModule({
    providers: [
      RedisService,
      { provide: ConfigService, useValue: { getOrThrow: () => "redis://localhost:6379" } },
    ],
  }).compile();
}

describe("RedisService", () => {
  beforeEach(() => {
    connectMock.mockReset().mockResolvedValue(undefined);
    quitMock.mockReset().mockResolvedValue(undefined);
    onMock.mockReset();
    RedisMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("boots headlessly and connects to Redis, logging readiness", async () => {
    const logSpy = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const moduleRef = await buildModule();

    // init() runs onModuleInit — the DI graph comes up with no HTTP server.
    await moduleRef.init();

    expect(connectMock).toHaveBeenCalledOnce();
    expect(onMock).toHaveBeenCalledWith("error", expect.any(Function));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Connected to Redis"));

    await moduleRef.close();
  });

  it("throws a clear error (no hang) when Redis is unreachable", async () => {
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    connectMock.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:6379"));
    const moduleRef = await buildModule();

    await expect(moduleRef.init()).rejects.toThrow(/Failed to connect to Redis/);
  });

  it("does not log the Redis password when connecting", async () => {
    const logSpy = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const service = new RedisService({
      getOrThrow: () => "redis://:sup3rsecret@localhost:6379",
    } as unknown as ConfigService);

    await service.onModuleInit();

    const logged = logSpy.mock.calls.map((call) => String(call[0])).join(" ");
    expect(logged).toContain("Connected to Redis");
    expect(logged).not.toContain("sup3rsecret");

    await service.onModuleDestroy();
  });

  it("closes the Redis connection on shutdown", async () => {
    const service = new RedisService({
      getOrThrow: () => "redis://localhost:6379",
    } as unknown as ConfigService);

    await service.onModuleDestroy();

    expect(quitMock).toHaveBeenCalledOnce();
  });
});
