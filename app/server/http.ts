/** Throw from a route to answer with a specific status and message. */
export class HttpError extends Error {
  name = 'HttpError';
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
