"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeCheckbox } from "@/components/ui/native-select";
import { MessageBox } from "@/components/admin/message-box";
import type { Settings } from "@/lib/types";
import {
  saveBirthdaySettingsAction,
  saveGeneralSettingsAction,
  sendTestSmsAction,
  type SettingsState,
  type TestSmsState,
} from "./actions";

function Result({ state }: { state: SettingsState }) {
  if (state.error) return <p className="text-sm text-destructive">{state.error}</p>;
  if (state.saved) return <p className="text-sm text-green-700 dark:text-green-400">Saved.</p>;
  return null;
}

export function GeneralSettingsForm({ settings }: { settings: Settings }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveGeneralSettingsAction, {});
  const [welcome, setWelcome] = useState(settings.welcome_template);
  return (
    <form action={action} className="grid max-w-2xl gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="church_name">Church name</Label>
        <Input id="church_name" name="church_name" defaultValue={settings.church_name} required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="logo_url">Logo URL (optional, shown on the registration form)</Label>
        <Input id="logo_url" name="logo_url" type="url" placeholder="https://…/logo.png" defaultValue={settings.logo_url ?? ""} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="sender_id_display">Sender ID (for reference only)</Label>
        <Input id="sender_id_display" name="sender_id_display" maxLength={11} defaultValue={settings.sender_id_display ?? ""} />
        <p className="text-xs text-muted-foreground">
          The sender ID actually used is set by your technical admin (NALO_SENDER_ID) and must be approved by Nalo.
        </p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="default_send_time">Default time for scheduled messages</Label>
        <Input id="default_send_time" name="default_send_time" type="time" defaultValue={settings.default_send_time.slice(0, 5)} className="w-32" />
      </div>
      <MessageBox
        name="welcome_template"
        label="Welcome SMS (sent once to new registrations)"
        value={welcome}
        onChange={setWelcome}
        churchName={settings.church_name}
      />
      <Result state={state} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}

export function BirthdaySettingsForm({ settings, readOnly }: { settings: Settings; readOnly?: boolean }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveBirthdaySettingsAction, {});
  const [template, setTemplate] = useState(settings.birthday_template);
  return (
    <form action={action} className="grid max-w-2xl gap-4">
      <fieldset disabled={readOnly} className="grid gap-4">
        <label className="flex items-center gap-2 text-sm">
          <NativeCheckbox name="birthday_enabled" defaultChecked={settings.birthday_enabled} />
          Send birthday SMS automatically
        </label>
        <div className="flex items-center gap-2 text-sm">
          Send at
          <Input type="time" name="birthday_send_time" defaultValue={settings.birthday_send_time.slice(0, 5)} className="w-32" />
          Ghana time
        </div>
        <MessageBox name="birthday_template" label="Birthday message" value={template} onChange={setTemplate} churchName={settings.church_name} />
      </fieldset>
      <Result state={state} />
      {!readOnly && (
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save birthday settings"}
          </Button>
        </div>
      )}
    </form>
  );
}

export function TestSmsForm() {
  const [state, action, pending] = useActionState<TestSmsState, FormData>(sendTestSmsAction, {});
  return (
    <form action={action} className="grid max-w-md gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="test_phone">Your phone number</Label>
        <Input id="test_phone" name="phone" type="tel" placeholder="024 123 4567" required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="test_message">Message (optional)</Label>
        <Input id="test_message" name="message" placeholder="Test message from {church_name}…" />
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Sending…" : "Send test SMS"}
        </Button>
      </div>
    </form>
  );
}
