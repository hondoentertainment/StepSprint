import { Router } from "express";
import { DateTime } from "luxon";
import { prisma } from "../prisma";

const router = Router();

router.get("/", async (_req, res) => {
  const challenges = await prisma.challenge.findMany({
    orderBy: { startDate: "desc" },
  });
  res.json({ challenges });
});

router.get("/active", async (_req, res) => {
  const today = DateTime.now().toISODate();
  const challenge = await prisma.challenge.findFirst({
    where: {
      startDate: { lte: new Date(today ?? "") },
      endDate: { gte: new Date(today ?? "") },
    },
    orderBy: { startDate: "desc" },
  });
  res.json({ challenge });
});

router.get("/:id", async (req, res) => {
  const challenge = await prisma.challenge.findUnique({
    where: { id: req.params.id },
  });
  if (!challenge) {
    res.status(404).json({ error: "Challenge not found" });
    return;
  }
  res.json({ challenge });
});

export default router;
