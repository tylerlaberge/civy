import { STATUS_CODES } from "node:http";
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";

/** Consistent error-response body returned for every failed request. */
export interface ErrorResponse {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

/**
 * Global exception filter defining the single error-response shape for the API.
 * HttpExceptions surface their status and message; anything else becomes a 500
 * without leaking internals. Later feature stories rely on this shape (e.g. the
 * validation pipe's errors flow through here).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const statusCode =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const { error, message } = this.describe(exception, statusCode);

    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${statusCode}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ErrorResponse = {
      statusCode,
      error,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    response.status(statusCode).json(body);
  }

  private describe(
    exception: unknown,
    statusCode: number,
  ): { error: string; message: string | string[] } {
    // Standard HTTP reason phrase for the status ("Not Found", "Bad Request"),
    // so `error` is consistent regardless of how the exception was constructed.
    const reason = STATUS_CODES[statusCode] ?? "Error";

    if (exception instanceof HttpException) {
      const responseBody = exception.getResponse();
      if (typeof responseBody === "string") {
        return { error: reason, message: responseBody };
      }
      const { error, message } = responseBody as {
        error?: string;
        message?: string | string[];
      };
      return {
        error: error ?? reason,
        message: message ?? exception.message,
      };
    }

    return {
      error: reason,
      message: "An unexpected error occurred.",
    };
  }
}
