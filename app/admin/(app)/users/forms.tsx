"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { createUserAction, resetPasswordAction, type UserState } from "./actions";

function Created({ state }: { state: UserState }) {
  if (state.error) return <p className="text-sm text-destructive">{state.error}</p>;
  if (!state.created) return null;
  return (
    <div className="rounded-lg border border-green-600/30 bg-green-600/10 p-3 text-sm">
      Give these login details to the person (privately). They should change the password under &quot;My account&quot;
      after logging in. This password is shown only once.
      <div className="mt-2 font-mono">
        Email: {state.created.email}
        <br />
        Password: {state.created.password}
      </div>
    </div>
  );
}

export function CreateUserForm() {
  const [state, action, pending] = useActionState<UserState, FormData>(createUserAction, {});
  return (
    <form action={action} className="grid max-w-2xl gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="full_name">Name</Label>
          <Input id="full_name" name="full_name" required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="role">Role</Label>
          <NativeSelect id="role" name="role" defaultValue="editor">
            <option value="editor">Editor: view members, send messages</option>
            <option value="admin">Admin: everything</option>
          </NativeSelect>
        </div>
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create login"}
        </Button>
      </div>
      <Created state={state} />
    </form>
  );
}

export function ResetPasswordForm({ id, email }: { id: string; email: string }) {
  const [state, action, pending] = useActionState<UserState, FormData>(resetPasswordAction, {});
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="email" value={email} />
      <Button type="submit" size="sm" variant="ghost" disabled={pending}>
        {pending ? "…" : "Reset password"}
      </Button>
      <Created state={state} />
    </form>
  );
}
