// A plain <select> styled like the other inputs. Native selects work best on
// phones (they open the phone's own picker) and need no JavaScript.
import * as React from "react";
import { cn } from "cn";

export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-base shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive md:text-sm dark:bg-input/30",
        className,
      )}
      {...props}
    />
  );
}

/** A native checkbox styled to match. Works with forms (FormData) out of the box. */
export function NativeCheckbox({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return <input type="checkbox" className={cn("size-4 shrink-0 accent-primary", className)} {...props} />;
}
