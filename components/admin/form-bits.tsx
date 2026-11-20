"use client";

// Client-side helpers for admin forms.
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

/** Submit button that shows a busy label while the form is being saved. */
export function SubmitButton({
  children,
  pendingText = "Saving…",
  ...props
}: React.ComponentProps<typeof Button> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending ? pendingText : children}
    </Button>
  );
}

/** A submit button that asks "Are you sure?" first. */
export function ConfirmButton({
  confirmText,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { confirmText: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (!window.confirm(confirmText)) e.preventDefault();
      }}
      {...props}
    >
      {pending ? "Working…" : children}
    </Button>
  );
}
