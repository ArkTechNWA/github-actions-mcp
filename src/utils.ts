/**
 * Utility functions - NEVERHANG patterns
 */

/**
 * Wrap a promise with a timeout
 * Part of NEVERHANG architecture - we never hang on external calls
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message?: string
): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    const id = setTimeout(() => {
      clearTimeout(id);
      reject(new Error(message || `Operation timed out after ${ms}ms`));
    }, ms);
  });

  return Promise.race([promise, timeout]);
}

/**
 * Simple circuit breaker for repeated failures
 */
export class CircuitBreaker {
  private failures = 0;
  private lastFailure = 0;
  private isOpen = false;

  constructor(
    private readonly threshold: number = 3,
    private readonly resetTimeMs: number = 60000,
    private readonly cooldownMs: number = 300000
  ) {}

  /**
   * Check if circuit is open (blocking requests)
   */
  check(): void {
    if (!this.isOpen) return;

    const now = Date.now();
    if (now - this.lastFailure > this.cooldownMs) {
      // Reset after cooldown
      this.isOpen = false;
      this.failures = 0;
      console.error("[CircuitBreaker] Circuit closed, resuming operations");
      return;
    }

    throw new Error(
      `Circuit breaker open: too many failures. Retry after ${Math.ceil((this.cooldownMs - (now - this.lastFailure)) / 1000)}s`
    );
  }

  /**
   * Record a successful operation
   */
  success(): void {
    // Gradually reduce failure count on success
    if (this.failures > 0) {
      this.failures--;
    }
  }

  /**
   * Record a failed operation
   */
  failure(): void {
    const now = Date.now();

    // Reset counter if enough time has passed since last failure
    if (now - this.lastFailure > this.resetTimeMs) {
      this.failures = 0;
    }

    this.failures++;
    this.lastFailure = now;

    if (this.failures >= this.threshold) {
      this.isOpen = true;
      console.error(
        `[CircuitBreaker] Circuit opened after ${this.failures} failures. Cooldown: ${this.cooldownMs / 1000}s`
      );
    }
  }
}

/**
 * Rate limit tracking
 */
export interface RateLimitInfo {
  remaining: number;
  limit: number;
  reset_at: Date;
}

export function parseRateLimitHeaders(headers: Record<string, string | undefined>): RateLimitInfo | null {
  const remaining = headers["x-ratelimit-remaining"];
  const limit = headers["x-ratelimit-limit"];
  const reset = headers["x-ratelimit-reset"];

  if (!remaining || !limit || !reset) {
    return null;
  }

  return {
    remaining: parseInt(remaining, 10),
    limit: parseInt(limit, 10),
    reset_at: new Date(parseInt(reset, 10) * 1000),
  };
}
