import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";
import { config } from "../config";
import { prisma } from "../prisma";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: Role;
  };
}

type TokenPayload = {
  sub: string;
  role: Role;
  ver: number;
};

function getTokenFromRequest(req: Request): string | null {
  const bearer = req.headers.authorization;
  if (bearer?.startsWith("Bearer ")) {
    return bearer.slice(7);
  }
  const cookie = req.cookies?.[config.cookieName];
  if (typeof cookie === "string") {
    return cookie;
  }
  return null;
}

export async function authRequired(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const token = getTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret) as TokenPayload;
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, tokenVersion: true },
    });
    if (!user) {
      res.status(401).json({ error: "Invalid session" });
      return;
    }
    // Reject tokens issued before the last logout or password change.
    if (typeof payload.ver === "number" && payload.ver !== user.tokenVersion) {
      res.status(401).json({ error: "Session expired" });
      return;
    }
    req.user = { id: user.id, role: user.role };
    next();
  } catch {
    res.status(401).json({ error: "Invalid session" });
  }
}

export function roleRequired(role: Role) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (req.user.role !== role) {
      res.status(403).json({ error: "Insufficient access" });
      return;
    }
    next();
  };
}
