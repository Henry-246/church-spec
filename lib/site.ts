// Addresses of the public site.

/** The /join link, optionally tagged with ?src= (which QR code / poster was used). */
export function joinUrl(baseUrl: string, src: string): string {
  const clean = src.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return `${baseUrl}/join${clean ? `?src=${clean}` : ""}`;
}
