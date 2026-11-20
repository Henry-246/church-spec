// Shown while an admin page is loading.
export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-48 rounded bg-muted" />
      <div className="h-4 w-72 rounded bg-muted" />
      <div className="h-64 rounded-lg bg-muted" />
    </div>
  );
}
