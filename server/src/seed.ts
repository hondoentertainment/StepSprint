import { PrismaClient, Role } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { DateTime } from "luxon";
import bcrypt from "bcryptjs";
import path from "path";

const dbPath = path.resolve(__dirname, "../dev.db");
const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
const prisma = new PrismaClient({ adapter });

const TZ = "America/Chicago";
const DEFAULT_PASSWORD = "password123";

async function main() {
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);
  const now = DateTime.now().setZone(TZ);
  const start = now.startOf("month").toISODate();
  const end = now.endOf("month").toISODate();

  const admin = await prisma.user.upsert({
    where: { email: "admin@stepsprint.local" },
    update: { passwordHash },
    create: {
      email: "admin@stepsprint.local",
      name: "Admin User",
      role: Role.ADMIN,
      passwordHash,
    },
  });

  const participants = await Promise.all(
    Array.from({ length: 12 }).map((_, idx) =>
      prisma.user.upsert({
        where: { email: `user${idx + 1}@stepsprint.local` },
        update: { passwordHash },
        create: {
          email: `user${idx + 1}@stepsprint.local`,
          name: `Walker ${idx + 1}`,
          role: Role.PARTICIPANT,
          passwordHash,
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

  await prisma.teamMember.deleteMany({
    where: { challengeId: challenge.id },
  });

  await prisma.team.deleteMany({
    where: { challengeId: challenge.id },
  });

  const teams = await Promise.all(
    ["Team Alpha", "Team Bravo", "Team Charlie"].map((name) =>
      prisma.team.create({
        data: {
          name,
          challengeId: challenge.id,
        },
      })
    )
  );

  const assignments = participants.map((participant, index) => ({
    userId: participant.id,
    challengeId: challenge.id,
    teamId: teams[index % teams.length]?.id,
    isLeader: index % teams.length === 0,
  }));

  await prisma.teamMember.createMany({
    data: assignments,
  });

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

  console.log("Seed complete!");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
