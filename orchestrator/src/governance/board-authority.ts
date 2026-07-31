import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { configRoot } from "../paths.js";

const AuthorityActionSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]+$/),
  description: z.string().min(10).max(240)
});

export const BoardAuthoritySchema = z.object({
  schemaVersion: z.literal(1),
  venture: z.literal("caught-up"),
  rings: z.object({
    autonomous: z.object({
      ring: z.literal(1),
      actions: z.array(AuthorityActionSchema).min(1)
    }),
    humanApproval: z.object({
      ring: z.literal(2),
      inboxType: z.literal("HUMAN_APPROVAL"),
      actions: z.array(AuthorityActionSchema).min(1)
    }),
    locked: z.object({
      ring: z.literal(3),
      controls: z.array(AuthorityActionSchema).min(1)
    })
  }),
  deliveryBoundary: z.object({
    codeWritesAllowed: z.literal(false),
    allowedPaths: z.tuple([
      z.literal("content/articles/<date>.en.mdx"),
      z.literal("content/articles/<date>.cs.mdx"),
      z.literal("public/illustrations/<date>.webp"),
      z.literal("public/data/board/<date>.json")
    ])
  }),
  revenueGate: z.object({
    acceptMoneyBeforeApproval: z.literal(false),
    hostingPlan: z.literal("vercel-pro"),
    hostingDecisionStatus: z.literal("resolved"),
    approvalActionId: z.literal("sponsor_or_revenue")
  })
});

export type BoardAuthority = z.infer<typeof BoardAuthoritySchema>;

export async function loadBoardAuthority(
  filePath = path.join(configRoot, "board-authority.json")
): Promise<BoardAuthority> {
  return BoardAuthoritySchema.parse(JSON.parse(await readFile(filePath, "utf8")) as unknown);
}
