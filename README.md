# Quadient Stress Dashboard

A real-time heart rate stress test dashboard built for Quadient events. Participants wear a Polar BLE sensor; the dashboard displays live BPM, HR zone, waveform, and session stats. An operator controls the session from a phone via Firebase-backed remote sync.

---

## Live URLs

| Purpose | URL |
|---|---|
| Main display | https://quadient-stress-dashboard.vercel.app |
| Chromecast / kiosk | https://quadient-stress-dashboard.vercel.app/?kiosk |
| Mobile remote control | https://quadient-stress-dashboard.vercel.app/?remote |

**Remote control PIN:** `5014`
Enter on the `?remote` screen — cached to the device after first entry.

---

## Git Repositories

Two remotes are configured. Keep both in sync.

| Remote name | Repository | Role |
|---|---|---|
| `origin` | https://github.com/Solarflare-Studio/quadient-stress-dashboard | Studio org repo — canonical source of truth |
| `johnsolarflare` | https://github.com/johnsolarflare/quadient-stress | Personal account repo — used by Claude Code (cloud) when creating branches and PRs |

```bash
# Push to both to keep in sync
git push origin main
git push johnsolarflare main
```

### Why two repos?

Vercel is connected to `johnsolarflare/quadient-stress` via GitHub webhook — pushing to `johnsolarflare/main` triggers an automatic production deploy within ~30 seconds. The `Solarflare-Studio` org repo has no Vercel connection (org-level GitHub App installation would be required to add it).

The `johnsolarflare` repo also exists because Claude Code (cloud / claude.ai) operates under the `johnsolarflare` personal GitHub account when creating branches and PRs (e.g. the Chromecast kiosk PR).

**Push to both to keep in sync; auto-deploy fires from `johnsolarflare`.**

---

## Deployment

Hosted on **Vercel** under the `john-2408s-projects` personal account. **Auto-deploy is active** — pushing to `johnsolarflare/main` triggers a production deploy automatically via GitHub webhook (~30s).

- **Build command:** `npm run build`
- **Output directory:** `dist`
- **Framework:** Vite (React + TypeScript)
- **SPA routing:** all paths rewrite to `index.html` via `vercel.json`

Manual deploy (if needed):
```bash
vercel --prod
```

### Environment Variables (Vercel Production)

All set under `john-2408s-projects/quadient-stress-dashboard`:

| Variable | Purpose |
|---|---|
| `VITE_REMOTE_PIN` | PIN for the mobile remote control (currently `5014`) |
| `VITE_FIREBASE_API_KEY` | Firebase project API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain |
| `VITE_FIREBASE_DATABASE_URL` | Firebase Realtime Database URL |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |

To update the PIN:
```bash
vercel env rm VITE_REMOTE_PIN production --yes
echo "NEW_PIN" | vercel env add VITE_REMOTE_PIN production
vercel --prod
```

---

## Local Development

```bash
npm install
npm run dev
```

Create a `.env.local` file with the Firebase vars for full remote sync locally:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_DATABASE_URL=...
VITE_FIREBASE_PROJECT_ID=...
VITE_REMOTE_PIN=5014
```

Without Firebase vars, the app runs in local-only mode (remote sync is a no-op).

---

## URL Parameters

| Parameter | Behaviour |
|---|---|
| *(none)* | Full dashboard with Operator Panel accessible |
| `?kiosk` | Clean display mode — Operator Panel hidden, logo clicks disabled. Use for Chromecast. |
| `?remote` | Mobile remote control UI. Requires PIN entry on first visit; cached to localStorage. |

---

## Architecture

```
src/
├── components/
│   ├── Header.tsx          # Logo, connection status, panel trigger
│   ├── BPMDisplay.tsx      # Live BPM ring
│   ├── Waveform.tsx        # Scrolling HR waveform
│   ├── StressGauge.tsx     # HR zone indicator
│   ├── StatsCards.tsx      # Min/Avg/Max for current session
│   ├── SessionTimer.tsx    # Elapsed time
│   ├── SessionSummary.tsx  # Aggregated all-time stats
│   ├── OperatorPanel.tsx   # Slide-in panel: connect, start/end session
│   └── RemoteControl.tsx   # Mobile remote UI (?remote)
└── services/
    ├── ble.ts              # Web Bluetooth — Polar sensor (GATT HR service)
    ├── dummyData.ts        # Simulated HR data for demo mode
    ├── sessionManager.ts   # Session lifecycle + IndexedDB persistence
    ├── db.ts               # IndexedDB aggregated stats
    └── remoteSync.ts       # Firebase Realtime Database sync
```

### Remote Sync Flow

1. Main dashboard calls `initRemoteSync()` on load and listens for commands via `onRemoteCommand`.
2. Phone opens `?remote`, enters PIN, and writes commands (`start` / `end` / `reset`) to Firebase under `sessions/<PIN>/command`.
3. Dashboard picks up the command and acts on it. Commands are deduplicated by skipping the first Firebase snapshot on subscribe (avoids clock-skew false negatives).
4. Dashboard pushes live status (BPM, session state, data source, connection) to Firebase every ~2s so the remote can display it.

### Polar BLE

- Uses Web Bluetooth GATT Heart Rate Service (`0x180D`)
- Supported: Chrome and Edge on desktop/Android
- **Not supported:** iOS Safari, Firefox
- Connection is initiated from the Operator Panel (click the status indicator in the header to open it)

### Data Sources

| Mode | Description |
|---|---|
| Demo | Simulated BPM data — no hardware needed |
| Polar Sensor | Live BLE data from a paired Polar heart rate device |

Switch source in the Operator Panel before starting a session. Cannot switch mid-session.

---

## Operator Panel Access

| Device | How to open |
|---|---|
| Desktop | Double-click the Quadient logo, **or** click the connection status (top-right) |
| Mobile | Tap the Quadient logo or connection status |
| Keyboard | Press `Enter` |

Kiosk mode (`?kiosk`) disables all panel access by design.

### Keyboard Shortcuts (main dashboard, non-kiosk)

| Key | Action |
|---|---|
| `Enter` | Toggle Operator Panel |
| `1` | Start session in Demo mode |
| `2` | Start session with Polar sensor (triggers BLE picker) |
| `3` | End active session |
