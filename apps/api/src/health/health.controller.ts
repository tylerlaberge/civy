import { Controller, Get } from "@nestjs/common";

export interface HealthStatus {
  status: "ok";
  uptime: number;
  timestamp: string;
}

/** Liveness endpoint used by tooling and later by deployment health checks. */
@Controller("health")
export class HealthController {
  @Get()
  check(): HealthStatus {
    return {
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
