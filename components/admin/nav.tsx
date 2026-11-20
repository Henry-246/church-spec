"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/types";

const LINKS: { href: string; label: string; adminOnly?: boolean }[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/members", label: "Members" },
  { href: "/admin/groups", label: "Groups" },
  { href: "/admin/messages/new", label: "Send message" },
  { href: "/admin/messages", label: "History" },
  { href: "/admin/reminders", label: "Reminders" },
  { href: "/admin/birthdays", label: "Birthdays" },
  { href: "/admin/qr", label: "QR codes" },
  { href: "/admin/settings", label: "Settings", adminOnly: true },
  { href: "/admin/users", label: "Admins", adminOnly: true },
];

export function AdminNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/admin"
      ? pathname === "/admin"
      : href === "/admin/messages"
        ? pathname === "/admin/messages" || /^\/admin\/messages\/(?!new)/.test(pathname)
        : pathname.startsWith(href);

  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
      {LINKS.filter((l) => !l.adminOnly || role === "admin").map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors ${
            isActive(l.href) ? "bg-primary text-primary-foreground" : "hover:bg-muted"
          }`}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
