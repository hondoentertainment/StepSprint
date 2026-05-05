// Sentry must be initialized before any other imports so that its
// auto-instrumentation can patch Node internals + Express.
import { initSentry } from "./sentry";
initSentry();

import app from "./app";
import { config } from "./config";
import { logger } from "./logger";
import { prisma } from "./prisma";
import { initPush } from "./services/push";
import { startDailyReminderScheduler } from "./services/scheduler";
import { logProductionReadiness } from "./startupReadiness";

logProductionReadiness();
initPush();
startDailyReminderScheduler();

const server = app.listen(config.port, () => {
  logger.info({ port: config.port }, "StepSprint server listening");
});

function shutdown(signal: string): void {
  logger.info({ signal }, "Shutting down");
  server.close(() => {
    void prisma
      .$disconnect()
      .catch((e: unknown) => logger.error({ err: e }, "Prisma disconnect failed"))
      .finally(() => process.exit(0));
  });
  setTimeout(() => {
    logger.error("Shutdown timed out; exiting");
    process.exit(1);
  }, 10_000).unref();
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
