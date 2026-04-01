# quadient-stress-dashboard

Live biometric display dashboard for Quadient event activation.

## Plugins / MCP tools used

| Tool | Purpose |
|------|---------|
| playwright | UI testing, screenshot capture |
| context7 | React / Vite / TypeScript docs |

## Stack

React, TypeScript, Vite, Tailwind v4, Web Bluetooth API

## Key commands

```bash
npx vite --host --port 5173   # dev server
npx tsc --noEmit              # type check
npm run build                 # production build
vercel deploy --prebuilt --prod --yes  # deploy
```

## Notes

- Bluetooth BPM is a proxy metric — do NOT label as validated HRV
- Vercel project: `quadient-stress-dashboard` under `john-2408s-projects`
- GitHub: `Solarflare-Studio/quadient-stress-dashboard` (private)
- Node binary at `~/bin/node/bin/node`
