import type { MiddlewareHandler } from 'hono';
import type { Env } from '../index';

export const authMiddleware: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim();

  if (!token || token !== c.env.ADMIN_PASSWORD) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  await next();
};
