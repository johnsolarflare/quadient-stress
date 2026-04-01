# quadient-stress-dashboard

Live biometric display dashboard for Quadient event activation.

**Type:** Client — Quadient  
**Repo:** https://github.com/johnsolarflare/quadient-stress

---

## Stack

React, TypeScript, Vite, Tailwind v4, Web Bluetooth API, Node.js (binary at `~/bin/node/bin/node`)

---

## Known Bugs / Gotchas

- Bluetooth BPM is a **proxy metric** — do NOT label as validated HRV in any UI or copy
- Web Bluetooth only works over HTTPS or localhost — test accordingly

---

## Active MCP Servers

| Server | Purpose |
|--------|---------|
| context7 | React / Vite / TypeScript / Tailwind docs lookup |

---

## Active Plugins

| Plugin | When to use |
|--------|-------------|
| playwright | UI testing, screenshot capture, visual regression |

---

## Key Commands

```bash
npx vite --host --port 5173        # dev server (host flag exposes to LAN for device testing)
npx tsc --noEmit                   # type check
npm run build                      # production build
vercel deploy --prebuilt --prod --yes  # deploy to Vercel
```

---

## Output & Deliverables

| Folder | Git | Contents |
|--------|-----|----------|
| `output/screenshots/` | Gitignored | Playwright captures, UI snapshots |
| `deliverables/docs/` | Gitignored | Client PDFs, HTML overviews, campaign copy |

`deliverables/` is not committed — store in cloud alongside the project and update this path:  
**Cloud path:** `[TODO: add Dropbox/Drive path once set up]`

---

## Notes

- Vercel project: `quadient-stress-dashboard` under `john-2408s-projects`
- Auto-deploys via Vercel webhook on push to main
- Billing: client project — track time against Quadient account
