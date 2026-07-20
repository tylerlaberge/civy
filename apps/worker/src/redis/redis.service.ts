import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
// Value import (not `import type`): ConfigService is the runtime DI token Nest
// reads from decorator metadata to inject it.
// biome-ignore lint/style/useImportType: needed as a runtime value for DI
import { ConfigService } from "@nestjs/config";
import { Redis } from "ioredis";

// Stop reconnecting after this many failed attempts so a missing/unreachable
// Redis surfaces as a boot error instead of an indefinite hang.
const MAX_CONNECT_ATTEMPTS = 5;

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

  constructor(config: ConfigService) {
    this.url = config.getOrThrow<string>("REDIS_URL");
    this.client = new Redis(this.url, {
      // Connect explicitly in onModuleInit so failures reject there, not on import.
      lazyConnect: true,
      // Required by BullMQ; also keeps commands from erroring mid-retry.
      maxRetriesPerRequest: null,
      // Bounded retries: returning null ends reconnection and rejects connect().
      retryStrategy: (attempt) =>
        attempt > MAX_CONNECT_ATTEMPTS ? null : Math.min(attempt * 200, 2000),
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
