import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
// Value import (not `import type`): ConfigService is the runtime DI token Nest
// reads from decorator metadata to inject it.
// biome-ignore lint/style/useImportType: needed as a runtime value for DI
import { ConfigService } from "@nestjs/config";
import { Redis } from "ioredis";

// During the initial boot connect, give up after this many failed attempts so a
// missing/unreachable Redis surfaces as a fatal boot error instead of hanging.
// After the first successful connect, reconnection is unbounded (see below).
const MAX_BOOT_CONNECT_ATTEMPTS = 5;

// Ceiling for the exponential-ish backoff between steady-state reconnect attempts.
const MAX_RECONNECT_DELAY_MS = 2000;

/**
 * Owns the shared ioredis connection. BullMQ (a later story) builds on ioredis
 * with `maxRetriesPerRequest: null` and a single shared client, so this is the
 * connection the queue infrastructure will reuse.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly url: string;
  private readonly client: Redis;
  // Flips true after the first successful connect, switching the retry policy
  // from bounded (fail-fast boot) to unbounded (self-healing runtime).
  private connectedOnce = false;

  constructor(config: ConfigService) {
    this.url = config.getOrThrow<string>("REDIS_URL");
    this.client = new Redis(this.url, {
      // Connect explicitly in onModuleInit so failures reject there, not on import.
      lazyConnect: true,
      // Required by BullMQ; also keeps commands from erroring mid-retry.
      maxRetriesPerRequest: null,
      retryStrategy: (attempt) => {
        // Runtime: once we've connected, retry forever so a transient Redis
        // outage self-heals rather than leaving a zombie worker with a dead client.
        if (this.connectedOnce) {
          return Math.min(attempt * 200, MAX_RECONNECT_DELAY_MS);
        }
        // Boot: bounded retries — returning null ends reconnection and rejects
        // connect(), so an unreachable Redis fails fast (fatal) instead of hanging.
        return attempt > MAX_BOOT_CONNECT_ATTEMPTS ? null : attempt * 200;
      },
    });

    // Without an error listener, ioredis logs "Unhandled error event" (and a
    // connection error could crash the process). Surface transient errors as
    // warnings; boot failures are still handled by onModuleInit rejecting.
    this.client.on("error", (error) => {
      this.logger.warn(`Redis connection error: ${error.message}`);
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.connect();
      this.connectedOnce = true;
      this.logger.log(`Connected to Redis at ${this.redactedUrl()}`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to connect to Redis at ${this.redactedUrl()}: ${reason}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }

  /** The shared connection, for BullMQ queues/workers in later stories. */
  getClient(): Redis {
    return this.client;
  }

  /** Connection target without credentials, safe to log. */
  private redactedUrl(): string {
    try {
      const parsed = new URL(this.url);
      return `${parsed.protocol}//${parsed.host}`;
    } catch {
      return "redis";
    }
  }
}
