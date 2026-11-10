import { definePlugin } from "nitro";
import { runScheduledBackup, type ScheduledEnv } from "./scheduled";

/** Nitro's cloudflare-module entry forwards Worker cron triggers to this hook. */
export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook("cloudflare:scheduled", async ({ env }) => {
    await runScheduledBackup(env as ScheduledEnv);
  });
});
