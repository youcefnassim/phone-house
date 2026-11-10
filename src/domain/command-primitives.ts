import { z } from "zod";
export const idempotencyKeySchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]{15,79}$/);
