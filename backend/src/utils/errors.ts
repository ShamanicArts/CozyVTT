export interface ErrorWithCode extends Error {
  code?: string;
}

export function asError(error: unknown): ErrorWithCode {
  return error instanceof Error
    ? (error as ErrorWithCode)
    : new Error(typeof error === "string" ? error : "Unknown error");
}

export function errorMessage(error: unknown, fallback: string): string {
  const normalized = asError(error);
  return normalized.message === "Unknown error" ? fallback : normalized.message;
}

export function hasErrorCode(
  error: unknown,
): error is Error & { code: string } {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string"
  );
}
