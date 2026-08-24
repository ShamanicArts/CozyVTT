export interface ApiError extends Error {
  code?: string;
  response?: {
    status?: number;
    data?: {
      error?: string;
      message?: string;
      errors?: Array<{ path: string | Array<string | number>; message: string }>;
      validationErrors?: Array<{
        path: string | Array<string | number>;
        message: string;
      }>;
    };
  };
}

export function asError(value: unknown): ApiError {
  if (value instanceof Error) return value as ApiError;

  return new Error(
    typeof value === "string" ? value : "An unexpected error occurred",
  );
}
