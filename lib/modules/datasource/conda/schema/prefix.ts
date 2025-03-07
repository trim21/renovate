import { z } from 'zod';

export const File = z.object({
  version: z.string(),
  createdAt: z.string().nullable(),
  yankedReason: z.string().nullable(),
});

export const Version = z.object({
  version: z.string(),
  createdAt: z.string().nullable(),
  yankedReason: z.string().nullable(),
});
