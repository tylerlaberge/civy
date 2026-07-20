import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";

/**
 * Apply the API-wide runtime configuration (validation pipe, error filter, CORS)
 * to a Nest app. Shared by main.ts and the e2e tests so the two can't drift and
 * tests exercise the same setup that runs in production.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);

  // Reject unknown fields and coerce payloads to their DTO types — the baseline
  // input contract every feature controller inherits.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Single, consistent error-response shape for the whole API.
  app.useGlobalFilters(new AllExceptionsFilter());

  app.enableCors({
    origin: config.getOrThrow<string>("CORS_ORIGIN"),
    credentials: true,
  });
}
