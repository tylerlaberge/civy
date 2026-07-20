import type { ArgumentsHost } from "@nestjs/common";
import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AllExceptionsFilter, type ErrorResponse } from "./all-exceptions.filter";

/** Build a mock ArgumentsHost and capture the JSON body the filter writes. */
function runFilter(exception: unknown): { statusCode: number; body: ErrorResponse } {
  let capturedStatus = 0;
  let capturedBody = {} as ErrorResponse;

  const response = {
    status: vi.fn((code: number) => {
      capturedStatus = code;
      return response;
    }),
    json: vi.fn((body: ErrorResponse) => {
      capturedBody = body;
      return response;
    }),
  };
  const request = { method: "GET", url: "/thing" };

  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;

  new AllExceptionsFilter().catch(exception, host);
  return { statusCode: capturedStatus, body: capturedBody };
}

describe("AllExceptionsFilter", () => {
  it("uses the HTTP reason phrase for a string-body HttpException", () => {
    const { statusCode, body } = runFilter(new HttpException("boom", 400));

    expect(statusCode).toBe(400);
    expect(body.error).toBe("Bad Request");
    expect(body.message).toBe("boom");
    expect(body.path).toBe("/thing");
  });

  it("maps an unknown error to a 500 with the standard shape", () => {
    const { statusCode, body } = runFilter(new Error("kaboom"));

    expect(statusCode).toBe(500);
    expect(body.error).toBe("Internal Server Error");
    expect(body.message).toBe("An unexpected error occurred.");
  });
});
