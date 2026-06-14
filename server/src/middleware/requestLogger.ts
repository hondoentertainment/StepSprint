import type { Request, Response, NextFunction } from "express";
import { config } from "../config";

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  if (!config.logHttp) {
    next();
    return;
  }

  const started = Date.now();
  res.on("finish", () => {
    if (req.originalUrl.startsWith("/api/health")) return;
    const ms = Date.now() - started;
    // eslint-disable-next-line no-console
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
  });
  next();
}
