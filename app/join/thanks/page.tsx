// Shown after a successful registration.
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Thank you" };

export default async function ThanksPage() {
  let churchName = "us";
  try {
    churchName = (await getSettings()).church_name;
  } catch {
    // Settings unavailable: keep the generic text.
  }
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="text-5xl" aria-hidden>🙏</div>
      <h1 className="text-2xl font-semibold">Thank you!</h1>
      <p className="text-muted-foreground">
        Your details have been saved. We are so glad you are with {churchName}. God bless you!
      </p>
    </main>
  );
}
