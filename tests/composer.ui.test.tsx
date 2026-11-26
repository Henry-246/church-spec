// @vitest-environment jsdom
// UI test: the "Send message" form, choosing ONE member as the audience.
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const john = { id: "6f1c2a7e-3b4d-4c5e-8f9a-0b1c2d3e4f5a", full_name: "John Doe", phone: "233241234567" };

vi.mock("@/app/admin/(app)/messages/actions", () => ({ sendMessageAction: vi.fn(async () => ({})) }));

// Fake API routes: /admin/api/member-search and /admin/api/audience-count
vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
  if (url.startsWith("/admin/api/member-search")) {
    const q = new URL(url, "http://x").searchParams.get("q") ?? "";
    return Response.json({ members: q.toLowerCase().startsWith("jo") ? [john] : [] });
  }
  if (url === "/admin/api/audience-count") {
    const { audience } = JSON.parse(String(init?.body));
    return Response.json({ count: audience.type === "all" ? 2 : 1 });
  }
  throw new Error("unexpected fetch " + url);
});

import { Composer } from "@/app/admin/(app)/messages/new/composer";

afterEach(cleanup);

const isEnabled = (el: HTMLElement) => !(el as HTMLButtonElement).disabled && el.getAttribute("aria-disabled") !== "true" && !el.hasAttribute("data-disabled");

const props = { groups: [], churchName: "Grace Chapel", sample: null, defaultSchedule: "2026-11-23T09:00" };

describe("Composer: send to one member", () => {
  it("enables Review & send after picking a member and typing a message", async () => {
    const user = userEvent.setup();
    render(<Composer {...props} presetMember={null} />);
    const button = () => screen.getByRole("button", { name: /review & send/i });

    await user.click(screen.getByLabelText("One member"));
    await user.type(screen.getByPlaceholderText(/type a name or phone/i), "Jo");
    await user.click(await screen.findByRole("button", { name: /John Doe/ }));
    await waitFor(() => expect(screen.getByText(/Recipients:/).textContent).toMatch(/Recipients:\s*1/));

    await user.type(screen.getByRole("textbox", { name: /message/i }), "Hello");
    await waitFor(() => expect(isEnabled(button())).toBe(true));
  });

  it("enables it when opened from a member's page (?member=...)", async () => {
    const user = userEvent.setup();
    render(<Composer {...props} presetMember={john} />);
    await waitFor(() => expect(screen.getByText(/Recipients:/).textContent).toMatch(/Recipients:\s*1/));
    await user.type(screen.getByRole("textbox", { name: /message/i }), "Hello");
    await waitFor(() => expect(isEnabled(screen.getByRole("button", { name: /review & send/i }))).toBe(true));
  });
});
