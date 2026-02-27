import app from "./app";
import { config } from "./config";

app.listen(config.port, () => {
  console.log(`StepSprint server running on port ${config.port}`);
});
