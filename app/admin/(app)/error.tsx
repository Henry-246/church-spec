"use client";

import { Button } from "@/components/ui/button";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="max-w-lg rounded-lg border border-destructive/30 bg-destructive/5 p-6">
      <h2 className="mb-2 font-semibold">This page could not be loaded</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        {error.message && !error.message.includes("Server Components") ? error.message : "An unexpected error happened."}
        {error.digest ? ` (reference: ${error.digest})` : ""}
      </p>
      <p className="mb-4 text-sm text-muted-foreground">
        If this is a new installation, check that the Supabase settings are filled in and the database SQL has been run (see README).
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
