import { writeBackup, type R2Like } from "./backup";
import type { D1Binding } from "./sqlite/d1-port";

export interface ScheduledEnv {
  DB?: D1Binding;
  BACKUPS?: R2Like;
  APP_ENV?: string;
}

/** Cron trigger (wrangler.jsonc "triggers"): daily D1 export to the private BACKUPS bucket.
 * Throws when misconfigured so the cron run is marked failed in Workers observability. */
export async function runScheduledBackup(env: ScheduledEnv, now = new Date()) {
  if (!env.DB || !env.BACKUPS || !env.APP_ENV) throw new Error("BACKUP_NOT_CONFIGURED");
  const result = await writeBackup(env.DB, env.BACKUPS, env.APP_ENV, now);
  console.log(JSON.stringify({ event: "d1_backup_written", ...result }));
  return result;
}
