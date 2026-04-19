// Sentry must be initialized before any other imports so that its
// auto-instrumentation can patch Node internals + Express.
import { initSentry } from "./sentry";
initSentry();

import app from "./app";
import { config } from "./config";

app.listen(config.port, () => {
  console.log(`StepSprint server running on port ${config.port}`);
});
