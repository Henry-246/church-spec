// The home page simply forwards visitors to the registration form.
// (Staff go to /admin.)
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/join");
}
