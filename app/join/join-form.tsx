"use client";

// The registration form shown on /join. Validation happens again on the
// server (actions.ts); checks here just give quicker feedback.
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeCheckbox, NativeSelect } from "@/components/ui/native-select";
import { Turnstile } from "@/components/turnstile";
import { normalizeGhanaPhone } from "@/lib/phone";
import { MONTHS, MEMBER_STATUSES, STATUS_LABELS } from "@/lib/types";
import { registerAction, type JoinState } from "./actions";

type Props = {
  churchName: string;
  groups: { id: string; name: string }[];
  siteKey: string;
  source: string;
};

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-sm text-destructive">{message}</p> : null;
}

export function JoinForm({ churchName, groups, siteKey, source }: Props) {
  const [state, formAction, pending] = useActionState<JoinState, FormData>(registerAction, { errors: {} });
  const [token, setToken] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | undefined>();

  // Controlled values so nothing is lost if the server sends back an error.
  const [values, setValues] = useState({
    full_name: "",
    phone: "",
    gender: "",
    birth_day: "",
    birth_month: "",
    birth_year: "",
    email: "",
    location: "",
    status: "",
  });
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const set = (name: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setValues((v) => ({ ...v, [name]: e.target.value }));

  const errors = state.errors;

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="source" value={source} />

      <div className="grid gap-1.5">
        <Label htmlFor="full_name">Full name *</Label>
        <Input id="full_name" name="full_name" autoComplete="name" required value={values.full_name} onChange={set("full_name")} aria-invalid={!!errors.full_name} />
        <FieldError message={errors.full_name} />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="phone">Phone number *</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="024 123 4567"
          required
          value={values.phone}
          onChange={(e) => {
            set("phone")(e);
            setPhoneError(undefined);
          }}
          onBlur={() => {
            if (values.phone.trim()) {
              const r = normalizeGhanaPhone(values.phone);
              setPhoneError(r.ok ? undefined : r.error);
            }
          }}
          aria-invalid={!!(phoneError ?? errors.phone)}
        />
        <FieldError message={phoneError ?? errors.phone} />
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">I am a *</legend>
        {MEMBER_STATUSES.map((s) => (
          <label key={s} className="flex items-center gap-2 text-sm">
            <input type="radio" name="status" value={s} checked={values.status === s} onChange={set("status")} className="size-4 accent-primary" />
            {STATUS_LABELS[s]}
          </label>
        ))}
        <FieldError message={errors.status} />
      </fieldset>

      <div className="grid gap-1.5">
        <Label>Birthday (so we can celebrate you)</Label>
        <div className="grid grid-cols-[1fr_1.6fr_1.2fr] gap-2">
          <NativeSelect name="birth_day" aria-label="Day" value={values.birth_day} onChange={set("birth_day")} aria-invalid={!!errors.birth_day}>
            <option value="">Day</option>
            {Array.from({ length: 31 }, (_, i) => (
              <option key={i + 1} value={i + 1}>{i + 1}</option>
            ))}
          </NativeSelect>
          <NativeSelect name="birth_month" aria-label="Month" value={values.birth_month} onChange={set("birth_month")} aria-invalid={!!errors.birth_day}>
            <option value="">Month</option>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </NativeSelect>
          <Input name="birth_year" aria-label="Year (optional)" inputMode="numeric" placeholder="Year (optional)" value={values.birth_year} onChange={set("birth_year")} aria-invalid={!!errors.birth_year} />
        </div>
        <FieldError message={errors.birth_day ?? errors.birth_month ?? errors.birth_year} />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="gender">Gender</Label>
        <NativeSelect id="gender" name="gender" value={values.gender} onChange={set("gender")}>
          <option value="">Prefer not to say</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
        </NativeSelect>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" value={values.email} onChange={set("email")} aria-invalid={!!errors.email} />
        <FieldError message={errors.email} />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="location">Where do you live? (area)</Label>
        <Input id="location" name="location" placeholder="e.g. East Legon" value={values.location} onChange={set("location")} />
        <FieldError message={errors.location} />
      </div>

      {groups.length > 0 && (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Groups / ministries you belong to or want to join</legend>
          <div className="grid grid-cols-2 gap-2">
            {groups.map((g) => (
              <label key={g.id} className="flex items-center gap-2 text-sm">
                <NativeCheckbox
                  name="group_ids"
                  value={g.id}
                  checked={groupIds.includes(g.id)}
                  onChange={(e) => setGroupIds((ids) => (e.target.checked ? [...ids, g.id] : ids.filter((x) => x !== g.id)))}
                />
                {g.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
        <NativeCheckbox name="sms_consent" className="mt-0.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>
          I agree to receive SMS messages from {churchName}. I can ask to stop at any time. *
        </span>
      </label>
      <FieldError message={errors.sms_consent} />

      <Turnstile siteKey={siteKey} onToken={setToken} resetKey={state.submittedAt} />

      {errors.form && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{errors.form}</p>}

      <Button type="submit" size="lg" disabled={pending || !consent || !token} className="h-11 text-base">
        {pending ? "Saving…" : "Submit"}
      </Button>
      {!consent && <p className="-mt-3 text-center text-xs text-muted-foreground">Tick the SMS agreement box to submit.</p>}
    </form>
  );
}
