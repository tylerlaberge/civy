import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const logger = new Logger("Bootstrap");

  // Headless: an application context has the full DI container and lifecycle but
  // no HTTP server — this process only runs background ingestion work.
  const app = await NestFactory.createApplicationContext(AppModule, {
    // Surface a clean fatal error (and non-zero exit) instead of hanging if a
    // dependency like Redis can't be reached during boot.
    abortOnError: false,
  });

  // Wire SIGINT/SIGTERM into Nest's lifecycle hooks so onModuleDestroy runs and
  // connections (Redis) close cleanly on shutdown.
  app.enableShutdownHooks();

  logger.log("Worker ready");
}

bootstrap().catch((error) => {
  new Logger("Bootstrap").fatal(
    "Worker failed to start",
    error instanceof Error ? error.stack : error,
  );
  process.exit(1);
});
