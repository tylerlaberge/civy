import { plainToInstance, Type } from "class-transformer";
import { IsInt, IsString, IsUrl, Max, Min, validateSync } from "class-validator";

/**
 * Typed, validated shape of the API's environment configuration. Read via
 * `ConfigService` elsewhere; the class here is the single source of truth for
 * which variables exist, their types, and their defaults.
 */
export class EnvironmentVariables {
  // Env values arrive as strings; @Type coerces PORT to a number before the
  // numeric constraints run (independent of reflected metadata).
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3000;

  @IsString()
  DATABASE_PATH = "./data/civy.sqlite";

  // require_tld: false so localhost origins are accepted in development.
  @IsUrl({ require_tld: false })
  CORS_ORIGIN = "http://localhost:4321";
}

/**
 * Nest's ConfigModule `validate` hook. Coerces raw env strings to the typed
 * shape and throws at boot if anything is missing or invalid, so the server
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
