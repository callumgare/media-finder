import { z } from "zod";

export const genericFileSchema = z.object({
  type: z.union([z.literal("full"), z.literal("thumbnail"), z.string()]).describe(""),
  url: z.string().url().describe(""),
  ext: z.string().regex(/^\w+$/).optional().describe(""),
  mimeType: z.string().optional().describe(""),
  image: z.boolean().optional(),
  video: z.boolean().optional(),
  audio: z.boolean().optional(),
  fileSize: z.number().int().optional(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
}).strict();

export type GenericFile = z.infer<typeof genericFileSchema>
