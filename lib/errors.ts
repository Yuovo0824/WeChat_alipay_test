import "server-only";

export class AppError extends Error {
  constructor(
    message: string,
    public status: number = 500,
    public code: string = "INTERNAL_ERROR"
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class AuthError extends AppError {
  constructor(message = "Authentication failed", code = "AUTH_FAILED") {
    super(message, 401, code);
  }
}

export class CsrfError extends AppError {
  constructor(message = "Invalid OAuth state") {
    super(message, 403, "CSRF_VALIDATION_FAILED");
  }
}
