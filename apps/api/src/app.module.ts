import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { validate } from "./config/env.validation";
import { HealthModule } from "./health/health.module";

@Module({
  imports: [
    // Env is validated at boot; an invalid/missing var throws before the app
    // starts listening. Global so ConfigService is injectable everywhere.
    ConfigModule.forRoot({ isGlobal: true, validate }),
    HealthModule,
  ],
})
export class AppModule {}
