import app from "./app";
import { config } from "./config";
import { logger } from "./logger";

app.listen(config.port, () => {
  logger.info({ port: config.port }, "StepSprint server listening");
});
