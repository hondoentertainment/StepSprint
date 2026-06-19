import type { Request, Response } from "express";
import { prisma } from "../prisma";
import { config } from "../config";

const startedAt = Date.now();

export async function healthHandler(_req: Request, res: Response): Promise<void> {
  let database: "ok" | "error" = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = "error";
  }

  const uptimeSeconds = Math.floor((Date.now() - startedAt) / 1000);
  const body = {
    ok: database === "ok",
    database,
    // `db` mirrors `database` using the up/down vocabulary the smoke-check
    // script (scripts/check-api-health.mjs) asserts against.
    db: database === "ok" ? "up" : "down",
    uptimeSeconds,
    commit: config.commitSha,
    release: config.commitSha ?? null,
  };

  if (database !== "ok") {
    res.status(503).json(body);
    return;
  }
  res.json(body);
}
