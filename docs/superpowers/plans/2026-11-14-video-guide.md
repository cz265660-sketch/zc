# Video guide implementation plan

**Goal:** Publish the requested public video catalog and private editor on the existing zc Worker.
**Architecture:** Buildless HTML/CSS/JS served by a Worker. A singleton SQLite Durable Object persists versioned catalog and login throttles; signed HttpOnly cookies authorize editing. Video files remain at user-provided HTTPS URLs. Backend is disabled until the owner configures ADMIN_PASSWORD in Cloudflare Secrets.
**Tech stack:** Cloudflare Workers, SQLite Durable Objects, Web Crypto, native browser video, qrcode-generator.
**Constraints:** Existing public repository cz265660-sketch/zc is empty. Use its main branch and existing Worker zc. No paid domain or paid upgrade. Workers.dev URL fixed at https://zc.cz265660.workers.dev. No media copied from grass QR provider. Eight empty tutorial entries. Chinese editor and bilingual public page.

## Tasks
- [ ] Test core behavior first: validation, unsafe URLs, session expiry, unauthorized writes, version conflict, persistent save.
- [ ] Implement core API and storage. Set security headers, same-origin mutation checks, throttled login, 8 hour cookies, disabled unconfigured login, input/body limits, optimistic revision checks.
- [ ] Implement responsive public catalog and admin editor, add/reorder/remove entries, preview, save, QR download, login/logout, clear playback errors and empty states. No user HTML injection.
- [ ] Run Node tests and syntax checks; push code through GitHub connector, fix Cloudflare build settings, deploy.
- [ ] Verify live public page, configured/unconfigured auth, mobile layout and QR; leave secret setup handoff if necessary.

## Review focus
Unsigned/expired sessions must not edit; missing Secret must fail closed; unsafe media URLs must be rejected; stale editor must not overwrite; blank media must be visibly unavailable. Credentials never enter Git or outputs. Persisting user edits must survive reload and deployment. No signed temporary source URLs seeded.
