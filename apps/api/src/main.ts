import "reflect-metadata";
import { Logger, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
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

  const port = config.getOrThrow<number>("PORT");
  await app.listen(port);
  new Logger("Bootstrap").log(`API listening on port ${port}`);
}

void bootstrap();
