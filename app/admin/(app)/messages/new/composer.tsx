"use client";

import { useActionState, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AudiencePicker } from "@/components/admin/audience-picker";
import { MessageBox } from "@/components/admin/message-box";
import { countSegments } from "@/lib/sms/segments";
import { renderTemplate } from "@/lib/templates";
import { sendMessageAction, type SendState } from "../actions";

type Props = {
  groups: { id: string; name: string }[];
  churchName: string;
  sample: { first_name: string; full_name: string } | null;
  presetMember: { id: string; full_name: string; phone: string } | null;
  defaultSchedule: string;
};

export function Composer({ groups, churchName, sample, presetMember, defaultSchedule }: Props) {
  const [state, action, pending] = useActionState<SendState, FormData>(sendMessageAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  const [body, setBody] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [when, setWhen] = useState<"now" | "later">("now");
  const [scheduledFor, setScheduledFor] = useState(defaultSchedule);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const segments = countSegments(renderTemplate(body, { ...(sample ?? {}), church_name: churchName })).segments;
  const units = (count ?? 0) * segments;
  const canReview = body.trim().length > 0 && count !== null && count > 0 && (when === "now" || !!scheduledFor);
  // Tells the admin what is still missing while the button is disabled.
  const missing =
    count === null
      ? "choose who should receive it (for “One member”, search and then click their name in the list)"
      : count === 0
        ? "choose an audience with at least one person who can receive SMS"
        : body.trim().length === 0
          ? "type a message"
          : when === "later" && !scheduledFor
            ? "choose the date and time"
            : null;

  return (
    <form ref={formRef} action={action} className="grid max-w-2xl gap-6">
      <AudiencePicker
        name="audience"
        groups={groups}
        initial={presetMember ? { type: "members", member_ids: [presetMember.id] } : undefined}
        initialMember={presetMember}
        onCount={setCount}
      />

      <MessageBox name="body" value={body} onChange={setBody} churchName={churchName} sample={sample} />

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">When</legend>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="when" value="now" checked={when === "now"} onChange={() => setWhen("now")} className="size-4 accent-primary" />
            Send now
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="when" value="later" checked={when === "later"} onChange={() => setWhen("later")} className="size-4 accent-primary" />
            Schedule for
          </label>
          {when === "later" && (
            <Input type="datetime-local" name="scheduled_for" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} className="w-auto" required />
          )}
        </div>
      </fieldset>

      {state.error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{state.error}</p>}

      <div>
        <Button type="button" size="lg" disabled={!canReview || pending} onClick={() => setConfirmOpen(true)}>
          {pending ? "Sending…" : "Review & send"}
        </Button>
        {!canReview && !pending && missing && <p className="mt-2 text-sm text-muted-foreground">To continue: {missing}.</p>}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{when === "now" ? "Send this message now?" : "Schedule this message?"}</DialogTitle>
            <DialogDescription>Please check before confirming. Sent SMS cannot be recalled.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1 text-sm">
            <p>
              Recipients: <b>{count?.toLocaleString()}</b>
            </p>
            <p>
              SMS per person: <b>{segments}</b> · Estimated total: <b>{units.toLocaleString()} SMS units</b>
            </p>
            {when === "later" && (
              <p>
                Send at: <b>{scheduledFor.replace("T", " ")}</b> (Ghana time)
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setConfirmOpen(false)}>
              Go back
            </Button>
            <Button
              type="button"
              disabled={pending}
              onClick={() => {
                setConfirmOpen(false);
                formRef.current?.requestSubmit();
              }}
            >
              {when === "now" ? `Send to ${count?.toLocaleString()} people` : "Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
