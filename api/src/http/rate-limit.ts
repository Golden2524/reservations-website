import type { RequestHandler } from 'express';
import { ApiError } from '../errors/api-error.js';

type RateLimitOptions = {
  namespace: string;
  maxRequests: number;
  windowMs: number;
};

type Counter = { count: number; resetAt: number };

const counters = new Map<string, Counter>();

const cleanup = (now: number) => {
  for (const [key, counter] of counters) {
    if (counter.resetAt <= now) counters.delete(key);
  }
};

/**
 * A deliberately small first-line limiter for sensitive public routes.
 * This is process-local: when ReserveFlow moves to multiple API instances it
 * must be replaced with a shared Redis-backed limiter.
 */
export const rateLimit = ({ namespace, maxRequests, windowMs }: RateLimitOptions): RequestHandler =>
  (request, response, next) => {
    const now = Date.now();
    cleanup(now);
    const key = `${namespace}:${request.ip}`;
    const current = counters.get(key);

    if (current && current.count >= maxRequests) {
      response.setHeader('Retry-After', String(Math.max(1, Math.ceil((current.resetAt - now) / 1000))));
      next(new ApiError(429, 'Too many requests. Please wait a moment and try again.', 'RATE_LIMITED'));
      return;
    }

    if (current) {
      current.count += 1;
    } else {
      counters.set(key, { count: 1, resetAt: now + windowMs });
    }
    next();
  };
