import { z } from "zod";
export const testCatalogSchema = z
  .object({
    brand: z.string().trim().min(1),
    model: z.string().trim().min(1),
    color: z.string().trim().min(1),
    variant: z.string().trim().min(1),
  })
  .strict();
export type TestCatalogEntry = z.infer<typeof testCatalogSchema> & { id: string };
