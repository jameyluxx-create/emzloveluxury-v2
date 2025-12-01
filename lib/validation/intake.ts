import { z } from "zod";

export const intakeSchema = z.object({
  itemNumber: z.string().min(1, "Item number is required"),
  slug: z.string().min(1, "Slug is required"),
  full_slug: z.string().min(1, "Full slug is required"),
  brand: z.string().min(1, "Brand is required"),
  model: z.string().min(1, "Model is required"),

  status: z.string().default("intake"),
  grade: z.string().default("B"),

  identity: z.any().default({}),
  seo: z
    .object({
      title: z.string().optional(),
      subtitle: z.string().optional(),
      bullets: z.array(z.string()).optional(),
      description: z.string().optional(),
    })
    .default({}),
  search_keywords: z.array(z.string()).default([]),

  notes: z.string().optional(),
  imagePlaceholderUrl: z.string().optional().nullable(),
});
