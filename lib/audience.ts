// Audience (who receives a message): validation and plain-English description.
import { z } from "zod";
import { MEMBER_STATUSES, STATUS_LABELS, type Audience } from "@/lib/types";

export const audienceSchema: z.ZodType<Audience> = z.discriminatedUnion("type", [
  z.object({ type: z.literal("all") }),
  z.object({ type: z.literal("groups"), group_ids: z.array(z.string().uuid()).min(1, "Choose at least one group.") }),
  z.object({ type: z.literal("status"), statuses: z.array(z.enum(MEMBER_STATUSES)).min(1, "Choose at least one status.") }),
  z.object({ type: z.literal("members"), member_ids: z.array(z.string().uuid()).min(1, "Choose a member.") }),
  z.object({ type: z.literal("phone"), phone: z.string().regex(/^233\d{9}$/) }),
]);

export function describeAudience(audience: Audience, groupNames: Record<string, string> = {}): string {
  switch (audience.type) {
    case "all":
      return "All members";
    case "groups":
      return "Groups: " + audience.group_ids.map((id) => groupNames[id] ?? "(deleted group)").join(", ");
    case "status":
      return audience.statuses.map((s) => STATUS_LABELS[s]).join(", ");
    case "members":
      return audience.member_ids.length === 1 ? "1 member" : `${audience.member_ids.length} members`;
    case "phone":
      return `Phone ${audience.phone}`;
  }
}
