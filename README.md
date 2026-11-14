# ZC Video Guide

Public site: https://zc.cz265660.workers.dev

Editor: https://zc.cz265660.workers.dev/admin

## Owner setup

In Cloudflare → Workers & Pages → zc → Settings → Runtime variables and secrets:

1. Add a **Secret** named `ADMIN_PASSWORD`.
2. Choose your own password of at least 12 characters (up to 256).
3. Deploy the change. Open `/admin` and sign in.

There is no default password. Until this secret is configured, all editing is disabled. Do not commit passwords, API keys or `.dev.vars` to GitHub. Changing the password invalidates existing sessions.

## Editing

The editor supports page/brand text, English and Chinese titles and descriptions, category, HTTPS video and cover links, ordering, visibility, adding/removing entries, and JSON backup export. Click **保存并发布** to commit changes to cloud storage. Empty video URLs show a coming-soon state. Hidden entries are excluded from the public API. Refresh visitors' pages after changing content. The QR always points to the same homepage and does not need to be reprinted after edits.

Video URLs must be public, long-lived HTTPS media links (MP4 recommended), not cloud-drive sharing or YouTube pages. Video hosting and uploads are not part of this version. Verify your provider supports public playback in Canada and browser-compatible video/audio codecs.

The public catalog starts with eight placeholders, with no videos copied from third parties. The home page defaults to English and can switch to Chinese. The public frontend and QR have no third-party script/CDN dependency; media files and poster images are fetched directly from your configured providers.

## Cloudflare build settings

- Repository: `cz265660-sketch/zc`, branch `main`
- Root: `/`
- Build command: `npm test && npm run build`
- Deploy command: `npx wrangler deploy`
- Runtime: Cloudflare Worker `zc`, SQLite Durable Object binding `CATALOG`

`wrangler.jsonc` provisions storage automatically on the first deployment. The catalog is stored in a singleton Durable Object and survives new deployments. Do not remove the binding, delete the object, rename the class, or remove the migration. Writes use revision checks to prevent a stale tab silently overwriting newer edits.

No paid domain or plan is required for this setup within Cloudflare's free quotas. Usage limits still apply; video-provider fees are separate. This repository does not configure or consent to paid upgrades.

## Development and validation

Use Node.js 22 or newer. Run `npm install`, `npm test`, `npm run build`, then `npx wrangler dev`. For local development only, use a gitignored `.dev.vars` containing a test-only `ADMIN_PASSWORD`. Local HTTP does not support the production Secure login cookie; use HTTPS for a full browser auth test.

Tests cover validation, signed session expiry/rotation, fail-closed setup, unauthorized writes, origin protection, login throttling, persistence contracts and revision conflicts. The API tests substitute a storage adapter; live deployment verifies the actual Durable Object binding.

## QR code

`/qr.svg` produces the QR locally on the Worker using qrcode-generator (MIT). `/qr.svg?download` downloads the same image as SVG for print. The fixed target is `https://zc.cz265660.workers.dev`.
