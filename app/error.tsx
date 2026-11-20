"use client";

// Shown when something unexpected goes wrong on a page.
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">
        Please try again. If it keeps happening, tell the church admin
        {error.digest ? ` (reference: ${error.digest})` : ""}.
      </p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
