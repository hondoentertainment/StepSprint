import app from "./app";
import { config } from "./config";
import { scheduleReminderJobs } from "./jobs/reminders";
import { scheduleFitnessSyncJobs } from "./jobs/fitnessSync";

scheduleReminderJobs();
scheduleFitnessSyncJobs();

app.listen(config.port, () => {
  console.log(`StepSprint server running on port ${config.port}`);
});
