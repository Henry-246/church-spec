export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-md animate-pulse space-y-4 px-4 py-10" aria-busy="true" aria-label="Loading">
      <div className="mx-auto h-8 w-56 rounded bg-muted" />
      <div className="h-10 rounded bg-muted" />
      <div className="h-10 rounded bg-muted" />
      <div className="h-24 rounded bg-muted" />
      <div className="h-10 rounded bg-muted" />
    </main>
  );
}
