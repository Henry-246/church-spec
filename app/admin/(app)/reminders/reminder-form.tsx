"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeCheckbox, NativeSelect } from "@/components/ui/native-select";
import { AudiencePicker } from "@/components/admin/audience-picker";
import { MessageBox } from "@/components/admin/message-box";
import { WEEKDAYS, type Frequency, type RecurringReminder } from "@/lib/types";
import { saveReminderAction, type ReminderState } from "./actions";

type Props = {
  reminder?: RecurringReminder;
  groups: { id: string; name: string }[];
  churchName: string;
  sample: { first_name: string; full_name: string } | null;
};

export function ReminderForm({ reminder, groups, churchName, sample }: Props) {
  const [state, action, pending] = useActionState<ReminderState, FormData>(saveReminderAction, {});
  const [body, setBody] = useState(reminder?.body ?? "");
  const [frequency, setFrequency] = useState<Frequency>(reminder?.frequency ?? "weekly");

  return (
    <form action={action} className="grid max-w-2xl gap-6">
      {reminder && <input type="hidden" name="id" value={reminder.id} />}
      <div className="grid gap-1.5">
        <Label htmlFor="name">Name (for staff)</Label>
        <Input id="name" name="name" defaultValue={reminder?.name} placeholder="e.g. Saturday service reminder" required />
      </div>

      <AudiencePicker name="audience" groups={groups} initial={reminder?.audience} allowSingleMember={false} />

      <MessageBox name="body" value={body} onChange={setBody} churchName={churchName} sample={sample} />

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium">How often (Ghana time)</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {(["weekly", "daily", "monthly"] as const).map((f) => (
            <label key={f} className="flex items-center gap-2 text-sm capitalize">
              <input type="radio" name="frequency" value={f} checked={frequency === f} onChange={() => setFrequency(f)} className="size-4 accent-primary" />
              {f}
            </label>
          ))}
        </div>
        {frequency === "weekly" && (
          <div className="flex flex-wrap gap-3">
            {WEEKDAYS.map((d, i) => (
              <label key={d} className="flex items-center gap-1.5 text-sm">
                <NativeCheckbox name="days_of_week" value={i} defaultChecked={reminder ? reminder.days_of_week.includes(i) : i === 6} />
                {d.slice(0, 3)}
              </label>
            ))}
          </div>
        )}
        {frequency === "monthly" && (
          <div className="flex items-center gap-2 text-sm">
            On day
            <NativeSelect name="day_of_month" defaultValue={reminder?.day_of_month ?? 1} className="w-20">
              {Array.from({ length: 31 }, (_, i) => (
                <option key={i + 1} value={i + 1}>{i + 1}</option>
              ))}
            </NativeSelect>
            of each month (29–31 = last day in shorter months)
          </div>
        )}
        <div className="flex items-center gap-2 text-sm">
          At
          <Input type="time" name="send_time" defaultValue={reminder?.send_time.slice(0, 5) ?? "18:00"} className="w-32" required />
        </div>
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <NativeCheckbox name="active" defaultChecked={reminder?.active ?? true} />
        Active (uncheck to pause)
      </label>

      {state.error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{state.error}</p>}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save reminder"}
        </Button>
      </div>
    </form>
  );
}
