import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { validate } from "./config/env.validation";
import { RedisModule } from "./redis/redis.module";

@Module({
  imports: [
    // Env is validated at boot; an invalid/missing var throws before the worker
    // starts. Global so ConfigService is injectable everywhere.
    ConfigModule.forRoot({ isGlobal: true, validate }),
    RedisModule,
  ],
})
export class AppModule {}
