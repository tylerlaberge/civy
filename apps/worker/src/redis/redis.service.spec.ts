import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RedisService } from "./redis.service";

// Mock ioredis so tests never touch a real server. vi.hoisted exposes the mocks
// to the (hoisted) vi.mock factory below.
const { connectMock, quitMock, disconnectMock, onMock, RedisMock } = vi.hoisted(() => {
  const connectMock = vi.fn();
  const quitMock = vi.fn();
  const disconnectMock = vi.fn();
  const onMock = vi.fn();
  const RedisMock = vi.fn(() => ({
    connect: connectMock,
    quit: quitMock,
    disconnect: disconnectMock,
    on: onMock,
  }));
  return { connectMock, quitMock, disconnectMock, onMock, RedisMock };
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

function buildService(url = "redis://localhost:6379"): RedisService {
  return new RedisService({ getOrThrow: () => url } as unknown as ConfigService);
}

// The `error` handler ioredis was registered with, so we can invoke it directly.
function captureErrorHandler(): (error: Error) => void {
  const call = onMock.mock.calls.find(([event]) => event === "error");
  return (call as [string, (error: Error) => void])[1];
}

describe("RedisService", () => {
  beforeEach(() => {
    connectMock.mockReset().mockResolvedValue(undefined);
    quitMock.mockReset().mockResolvedValue(undefined);
    disconnectMock.mockReset();
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
    const service = buildService();

    await service.onModuleDestroy();

    expect(quitMock).toHaveBeenCalledOnce();
    // Forced teardown always runs after the graceful QUIT.
    expect(disconnectMock).toHaveBeenCalledOnce();
  });

  it("does not hang on shutdown when QUIT never resolves (Redis unreachable)", async () => {
    vi.useFakeTimers();
    // maxRetriesPerRequest: null means an offline QUIT never settles.
    quitMock.mockReturnValue(new Promise<void>(() => undefined));
    const service = buildService();

    const destroy = service.onModuleDestroy();
    // Advance past the shutdown timeout so the race resolves via the timer.
    await vi.advanceTimersByTimeAsync(2000);
    await expect(destroy).resolves.toBeUndefined();

    expect(disconnectMock).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("still forces disconnect when QUIT rejects (already closed)", async () => {
    quitMock.mockRejectedValue(new Error("Connection is closed."));
    const service = buildService();

    await expect(service.onModuleDestroy()).resolves.toBeUndefined();

    expect(disconnectMock).toHaveBeenCalledOnce();
  });

  describe("retryStrategy", () => {
    // Pull the strategy ioredis was constructed with so we can exercise it directly.
    function captureRetryStrategy(): (attempt: number) => number | null {
      const [, options] = RedisMock.mock.calls[0] as unknown as [
        string,
        { retryStrategy: (attempt: number) => number | null },
      ];
      return options.retryStrategy;
    }

    it("gives up during boot so an unreachable Redis fails fast", () => {
      new RedisService({ getOrThrow: () => "redis://localhost:6379" } as unknown as ConfigService);
      const retryStrategy = captureRetryStrategy();

      // Before the first successful connect: bounded, then null (ends reconnection).
      expect(retryStrategy(1)).toBeGreaterThan(0);
      expect(retryStrategy(100)).toBeNull();
    });

    it("reconnects indefinitely (capped) after the first successful connect", async () => {
      vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
      const service = new RedisService({
        getOrThrow: () => "redis://localhost:6379",
      } as unknown as ConfigService);
      const retryStrategy = captureRetryStrategy();

      await service.onModuleInit();

      // Post-connect: never gives up, and the backoff is capped at 2000ms.
      expect(retryStrategy(100)).toBe(2000);
      expect(retryStrategy(100000)).toBe(2000);

      await service.onModuleDestroy();
    });
  });

  describe("connection error logging", () => {
    it("stays quiet on pre-connect errors (boot failure speaks via the fatal)", () => {
      const warnSpy = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
      buildService();

      // A failed boot attempt fires ~5 of these; warning here would just be noise.
      captureErrorHandler()(new Error("connect ECONNREFUSED 127.0.0.1:6379"));

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("warns on errors after a successful connect (genuine steady-state blip)", async () => {
      vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
      const warnSpy = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
      const service = buildService();

      await service.onModuleInit();
      captureErrorHandler()(new Error("READONLY You can't write against a read only replica."));

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Redis connection error"));

      await service.onModuleDestroy();
    });
  });
});
