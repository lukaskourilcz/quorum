import { z, type ZodType } from "zod";
import { CalendarFeedSchema } from "./calendar.js";
import { EditionPackageSchema } from "./edition-package.js";
import { IdeaLedgerEntrySchema } from "./idea-ledger.js";
import { MeetingEmailSchema } from "./meeting-email.js";
import { MeetingRecordSchema } from "./meeting-record.js";
import { SocialPackSchema } from "./social-pack.js";

export const ContractSchemas = {
  "calendar": CalendarFeedSchema,
  "edition-package": EditionPackageSchema,
  "idea-ledger": IdeaLedgerEntrySchema,
  "meeting-email": MeetingEmailSchema,
  "meeting-record": MeetingRecordSchema,
  "social-pack": SocialPackSchema
} satisfies Record<string, ZodType>;

export type ContractName = keyof typeof ContractSchemas;

export function jsonSchemaText(name: ContractName): string {
  const schema = z.toJSONSchema(ContractSchemas[name], {
    target: "draft-2020-12",
    unrepresentable: "any"
  });
  return `${JSON.stringify({ ...schema, $id: `https://boardless.ai/contracts/${name}.schema.json` }, null, 2)}\n`;
}
