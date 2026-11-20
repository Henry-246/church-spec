"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeCheckbox } from "@/components/ui/native-select";
import { importMembersAction, type ImportState } from "../actions";

export function ImportForm() {
  const [state, action, pending] = useActionState<ImportState, FormData>(importMembersAction, {});
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");

  return (
    <form action={action} className="grid max-w-2xl gap-4">
      <Input
        type="file"
        accept=".csv,text/csv"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          setFileName(file?.name ?? "");
          setCsv(file ? await file.text() : "");
        }}
      />
      <input type="hidden" name="csv" value={csv} />
      <label className="flex items-start gap-2 text-sm">
        <NativeCheckbox name="assume_consent" className="mt-0.5" />
        <span>
          Everyone in this file has agreed to receive SMS from the church (used when the file has no <code>sms_consent</code> column).
        </span>
      </label>
      <div>
        <Button type="submit" disabled={pending || !csv}>
          {pending ? "Importing…" : fileName ? `Import ${fileName}` : "Import"}
        </Button>
      </div>

      {state.error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{state.error}</p>}
      {state.done && (
        <div className="rounded-lg border p-4 text-sm">
          <p className="font-medium">
            Import finished: {state.created} added, {state.updated} updated, {state.skipped?.length ?? 0} skipped.
          </p>
          {!!state.skipped?.length && (
            <ul className="mt-2 max-h-60 list-disc overflow-auto pl-5 text-muted-foreground">
              {state.skipped.map((s) => (
                <li key={s.line}>
                  Line {s.line}: {s.reason}
                </li>
              ))}
            </ul>
          )}
          <Link href="/admin/members" className="mt-3 inline-block underline">
            View members
          </Link>
        </div>
      )}
    </form>
  );
}
