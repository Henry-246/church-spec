// Small shared building blocks for admin pages.
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { CampaignStatus, OutboundStatus } from "@/lib/types";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Notice({ kind = "info", children }: { kind?: "info" | "success" | "error" | "warning"; children: React.ReactNode }) {
  const styles = {
    info: "border-border bg-muted/50",
    success: "border-green-600/30 bg-green-600/10 text-green-800 dark:text-green-300",
    error: "border-destructive/30 bg-destructive/10 text-destructive",
    warning: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  }[kind];
  return <div className={`mb-4 rounded-lg border p-3 text-sm ${styles}`}>{children}</div>;
}

const STATUS_STYLES: Record<string, string> = {
  scheduled: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  queued: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  pending: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  sending: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  done: "bg-green-600/15 text-green-700 dark:text-green-300",
  sent: "bg-green-600/15 text-green-700 dark:text-green-300",
  failed: "bg-destructive/15 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

export function StatusBadge({ status }: { status: CampaignStatus | OutboundStatus | string }) {
  return (
    <Badge variant="outline" className={`border-transparent capitalize ${STATUS_STYLES[status] ?? ""}`}>
      {status}
    </Badge>
  );
}

/** Simple previous/next pagination using ?page=. */
export function Pager({ page, pageSize, total, href }: { page: number; pageSize: number; total: number; href: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between text-sm">
      <span className="text-muted-foreground">
        Page {page} of {pages} ({total} total)
      </span>
      <div className="flex gap-2">
        {page > 1 && (
          <Link className="rounded-md border px-3 py-1.5 hover:bg-muted" href={href(page - 1)}>
            ← Previous
          </Link>
        )}
        {page < pages && (
          <Link className="rounded-md border px-3 py-1.5 hover:bg-muted" href={href(page + 1)}>
            Next →
          </Link>
        )}
      </div>
    </div>
  );
}

/** Builds a URL with updated search params (empty values are removed). */
export function withParams(base: string, params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  const s = sp.toString();
  return s ? `${base}?${s}` : base;
}
