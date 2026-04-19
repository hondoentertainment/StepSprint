// Sentry must be initialized before any other imports so that its
// auto-instrumentation can patch Node internals + Express.
import { initSentry } from "./sentry";
initSentry();

import app from "./app";
import { config } from "./config";
import { logger } from "./logger";

app.listen(config.port, () => {
  logger.info({ port: config.port }, "StepSprint server listening");
});
