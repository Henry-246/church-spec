// OpenNext Cloudflare adapter config.
// We deliberately do NOT configure an incremental cache (R2/KV): every page in
// this app is dynamic (forms, admin, database reads), so there is nothing to
// cache, and R2 would require adding a payment method to Cloudflare.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({});
