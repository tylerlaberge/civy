import { plainToInstance } from "class-transformer";
import { IsString, IsUrl, validateSync } from "class-validator";

/**
 * Typed, validated shape of the worker's environment configuration. Read via
 * `ConfigService` elsewhere; the class here is the single source of truth for
 * which variables exist, their types, and their defaults.
 */
export class EnvironmentVariables {
  // require_tld: false so localhost URLs are accepted in development.
  @IsUrl({ protocols: ["redis", "rediss"], require_tld: false })
  REDIS_URL = "redis://localhost:6379";

  @IsString()
  DATABASE_PATH = "./data/civy.sqlite";
}

/**
 * Nest's ConfigModule `validate` hook. Coerces raw env strings to the typed
 * shape and throws at boot if anything is missing or invalid, so the worker
 * never starts in a misconfigured state.
 */
export function validate(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, {
    skipMissingProperties: false,
    whitelist: false,
  });

  if (errors.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n${errors
        .map((error) => `  - ${Object.values(error.constraints ?? {}).join(", ")}`)
        .join("\n")}`,
    );
  }

  return validated;
}
