import { Global, Module } from "@nestjs/common";
import { RedisService } from "./redis.service";

// Global so later feature modules can inject the shared connection without
// re-importing this module everywhere.
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
