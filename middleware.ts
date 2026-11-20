// Runs before every /admin request (Next.js middleware).
// Note: Next.js 16 prefers the new "proxy.ts" name, but proxy always runs on
// the Node.js runtime, which the Cloudflare adapter only supports
// experimentally. The classic edge middleware is fully supported, so we keep it.
// Its only job: keep the admin's Supabase login session fresh by refreshing
// the session cookie. Real permission checks happen in lib/auth.ts and in the
// database (Row Level Security).
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getEnv } from "@/lib/env";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!url || !anonKey) return response; // not configured yet; pages will show the error

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Refreshes the session if it has expired. Do not remove.
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
