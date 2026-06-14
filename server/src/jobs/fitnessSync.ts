import cron from "node-cron";
import { config } from "../config";
import { syncAllFitnessConnections } from "../services/fitness/syncService";

export function scheduleFitnessSyncJobs(): void {
  const ok = cron.validate(config.fitnessSyncCron);
  if (!ok) {
    console.warn(`Invalid FITNESS_SYNC_CRON "${config.fitnessSyncCron}" — fitness sync disabled`);
    return;
  }
  cron.schedule(
    config.fitnessSyncCron,
    () => {
      syncAllFitnessConnections().catch((err) => console.error("Fitness sync job failed:", err));
    },
    { timezone: config.fitnessSyncTz }
  );
  console.log(`Fitness sync cron: ${config.fitnessSyncCron} (${config.fitnessSyncTz})`);
}
