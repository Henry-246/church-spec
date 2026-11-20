"use client";

// Add / edit member form (admins). Editors see it read-only.
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeCheckbox, NativeSelect } from "@/components/ui/native-select";
import { formatGhanaPhone } from "@/lib/phone";
import { MEMBER_STATUSES, MONTHS, STATUS_LABELS, type Member } from "@/lib/types";
import { saveMemberAction, type MemberFormState } from "./actions";

type Props = {
  member?: Member;
  memberGroupIds?: string[];
  groups: { id: string; name: string }[];
  readOnly?: boolean;
};

function Err({ m }: { m?: string }) {
  return m ? <p className="text-sm text-destructive">{m}</p> : null;
}

export function MemberForm({ member, memberGroupIds = [], groups, readOnly }: Props) {
  const [state, action, pending] = useActionState<MemberFormState, FormData>(saveMemberAction, { errors: {} });
  const e = state.errors;

  return (
    <form action={action} className="grid max-w-2xl gap-4">
      <fieldset disabled={readOnly || pending} className="grid gap-4">
        {member && <input type="hidden" name="id" value={member.id} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="full_name">Full name *</Label>
            <Input id="full_name" name="full_name" defaultValue={member?.full_name} required />
            <Err m={e.full_name} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="phone">Phone *</Label>
            <Input id="phone" name="phone" type="tel" defaultValue={member ? formatGhanaPhone(member.phone) : ""} required />
            <Err m={e.phone} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="status">Status *</Label>
            <NativeSelect id="status" name="status" defaultValue={member?.status ?? "member"}>
              {MEMBER_STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </NativeSelect>
            <Err m={e.status} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="gender">Gender</Label>
            <NativeSelect id="gender" name="gender" defaultValue={member?.gender ?? ""}>
              <option value="">—</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </NativeSelect>
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label>Birthday</Label>
          <div className="grid grid-cols-3 gap-2">
            <NativeSelect name="birth_day" aria-label="Day" defaultValue={member?.birth_day ?? ""}>
              <option value="">Day</option>
              {Array.from({ length: 31 }, (_, i) => (
                <option key={i + 1} value={i + 1}>{i + 1}</option>
              ))}
            </NativeSelect>
            <NativeSelect name="birth_month" aria-label="Month" defaultValue={member?.birth_month ?? ""}>
              <option value="">Month</option>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </NativeSelect>
            <Input name="birth_year" aria-label="Year" placeholder="Year" inputMode="numeric" defaultValue={member?.birth_year ?? ""} />
          </div>
          <Err m={e.birth_day ?? e.birth_month ?? e.birth_year} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" defaultValue={member?.email ?? ""} />
            <Err m={e.email} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="location">Location</Label>
            <Input id="location" name="location" defaultValue={member?.location ?? ""} />
          </div>
        </div>

        {groups.length > 0 && (
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Groups</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {groups.map((g) => (
                <label key={g.id} className="flex items-center gap-2 text-sm">
                  <NativeCheckbox name="group_ids" value={g.id} defaultChecked={memberGroupIds.includes(g.id)} />
                  {g.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div className="grid gap-1.5">
          <Label htmlFor="notes">Notes (only staff can see these)</Label>
          <Textarea id="notes" name="notes" rows={3} defaultValue={member?.notes ?? ""} />
        </div>

        <label className="flex items-start gap-2 text-sm">
          <NativeCheckbox name="sms_consent" className="mt-0.5" defaultChecked={member ? member.sms_consent : true} />
          <span>This person has agreed to receive SMS messages from the church.</span>
        </label>
      </fieldset>

      {e.form && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{e.form}</p>}
      {state.saved && !pending && <p className="text-sm text-green-700 dark:text-green-400">Saved.</p>}
      {!readOnly && (
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : member ? "Save changes" : "Add member"}
          </Button>
        </div>
      )}
    </form>
  );
}
