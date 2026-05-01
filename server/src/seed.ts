import { PrismaClient, Role } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { DateTime } from "luxon";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { logger } from "./logger";

const databaseUrl = process.env.DATABASE_URL ?? "file:./dev.db";
const adapter = new PrismaBetterSqlite3({ url: databaseUrl });
const prisma = new PrismaClient({ adapter });

const TZ = "America/Chicago";

// In production, the admin password must be set via ADMIN_PASSWORD env var.
// In dev, fall back to a well-known default so local setup stays simple.
const isProduction = process.env.NODE_ENV === "production";
let adminPassword = process.env.ADMIN_PASSWORD;
if (!adminPassword) {
  if (isProduction) {
    // Generate a random password and print it once — admin must change it.
    adminPassword = crypto.randomBytes(16).toString("base64url");
    logger.warn(
      { password: adminPassword },
      "ADMIN_PASSWORD not set — generated a random admin password. Change it immediately after first login."
    );
  } else {
    adminPassword = "password123";
  }
}

// Dev participants always use this fixed password for easy local testing.
const PARTICIPANT_PASSWORD = isProduction ? null : "password123";

async function main() {
  const adminHash = await bcrypt.hash(adminPassword!, 12);
  const now = DateTime.now().setZone(TZ);
  const start = now.startOf("month").toISODate();
  const end = now.endOf("month").toISODate();

  const admin = await prisma.user.upsert({
    where: { email: "admin@stepsprint.local" },
    update: { passwordHash: adminHash, emailVerified: true },
    create: {
      email: "admin@stepsprint.local",
      name: "Admin User",
      role: Role.ADMIN,
      passwordHash: adminHash,
      emailVerified: true,
    },
  });

  if (isProduction) {
    // In production we only seed the admin account — no demo data.
    logger.info({ adminEmail: admin.email }, "Production seed complete.");
    return;
  }

  const participantHash = await bcrypt.hash(PARTICIPANT_PASSWORD!, 12);

  const participants = await Promise.all(
    Array.from({ length: 12 }).map((_, idx) =>
      prisma.user.upsert({
        where: { email: `user${idx + 1}@stepsprint.local` },
        update: { passwordHash: participantHash, emailVerified: true },
        create: {
          email: `user${idx + 1}@stepsprint.local`,
          name: `Walker ${idx + 1}`,
          role: Role.PARTICIPANT,
          passwordHash: participantHash,
          emailVerified: true,
        },
      })
    )
  );

  const challenge = await prisma.challenge.upsert({
    where: { id: "demo-challenge" },
    update: {
      name: "StepSprint Demo",
      startDate: new Date(start ?? ""),
      endDate: new Date(end ?? ""),
      timezone: TZ,
      teamSize: 4,
      locked: false,
    },
    create: {
      id: "demo-challenge",
      name: "StepSprint Demo",
      startDate: new Date(start ?? ""),
      endDate: new Date(end ?? ""),
      timezone: TZ,
      teamSize: 4,
      locked: false,
    },
  });

  await prisma.teamMember.deleteMany({ where: { challengeId: challenge.id } });
  await prisma.team.deleteMany({ where: { challengeId: challenge.id } });

  const teams = await Promise.all(
    ["Team Alpha", "Team Bravo", "Team Charlie"].map((name) =>
      prisma.team.create({ data: { name, challengeId: challenge.id } })
    )
  );

  const assignments = participants.map((participant, index) => ({
    userId: participant.id,
    challengeId: challenge.id,
    teamId: teams[index % teams.length]?.id,
    isLeader: index % teams.length === 0,
  }));

  await prisma.teamMember.createMany({ data: assignments });

  const dates = Array.from({ length: 10 }).map((_, offset) =>
    now.minus({ days: offset }).toISODate()
  );

  for (const participant of participants) {
    for (const date of dates) {
      const steps = Math.floor(6000 + Math.random() * 8000);
      await prisma.stepSubmission.upsert({
        where: {
          userId_challengeId_date: {
            userId: participant.id,
            challengeId: challenge.id,
            date: new Date(date ?? ""),
          },
        },
        update: { steps },
        create: {
          userId: participant.id,
          challengeId: challenge.id,
          date: new Date(date ?? ""),
          steps,
          isFlagged: steps > 100000,
        },
      });
    }
  }

  await prisma.auditLog.create({
    data: {
      action: "seed",
      actorId: admin.id,
      challengeId: challenge.id,
      metadata: { note: "Seeded demo challenge data." },
    },
  });

  logger.info("Dev seed complete!");
}

main()
  .catch((error) => {
    logger.error({ err: error }, "Seed failed");
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
