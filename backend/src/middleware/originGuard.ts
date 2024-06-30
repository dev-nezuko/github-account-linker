import type { NextFunction, Request, Response } from 'express';
import appConfig from '../config/appConfig';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// SameSite=Lax still sends the session cookie on requests from other ports of the
// same host (for example another localhost app), so state-changing calls must come
// from the frontend origin itself.
export function requireFrontendOrigin(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method) || req.get('origin') === appConfig.frontendOrigin) {
    next();
    return;
  }
  res.status(403).json({message: 'Request origin is not allowed'});
}
