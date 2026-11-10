import { z } from "zod";

// This attestation is deployment configuration, never a browser-supplied flag.
// It permits connection only; it does not authorize migrations or live trade.
export const dedicatedBackendSchema = z
  .object({
    url: z.string().url(),
    publishableKey: z.string().min(1),
    projectRef: z.string().regex(/^[a-z0-9]{20}$/),
    environment: z.literal("dedicated-development"),
    ownerConfirmed: z.literal(true),
  })
  .strict()
  .superRefine((value, ctx) => {
    const url = new URL(value.url);
    if (
      url.protocol !== "https:" ||
      url.hostname !== `${value.projectRef}.supabase.co` ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    ) {
      ctx.addIssue({ code: "custom", message: "Dedicated project identity mismatch" });
    }
    if (!value.publishableKey.startsWith("sb_publishable_")) {
      ctx.addIssue({ code: "custom", message: "A publishable key is required" });
    }
  });
export type DedicatedBackend = z.infer<typeof dedicatedBackendSchema>;
export function parseDedicatedBackend(value: unknown): DedicatedBackend {
  return dedicatedBackendSchema.parse(value);
}
export type BackendConnectionStatus = {
  state: "NOT_CONNECTED" | "CONFIGURATION_INVALID" | "CONFIGURED_NOT_VERIFIED";
  persistenceVerified: false;
  authenticationVerified: false;
  realModeAvailable: false;
};
