# quadient-stress-dashboard

Live biometric display dashboard for Quadient event activation.

**Type:** Client — Quadient  
**Repo:** https://github.com/johnsolarflare/quadient-stress

---

## RULE: Update This File Every Session

At the end of every session (or when switching tasks), update:
- **Current Status** — what's working, what's broken
- **Open Issues** — add/close items with dates
- **Last Known Good State** — which commits/deployments are confirmed working

This file is the source of truth between conversations.

---

## URLs

| URL | Branch | Purpose |
|-----|--------|---------|
| https://quadient-stress-dashboard.vercel.app/ | `main` | Live client-facing dashboard |
| https://quadient-stress-staging-2.vercel.app/ | `staging-2` | Staging with zone sensitivity experiments |
| https://quadient-stress-dashboard.vercel.app/?remote | `main` | Remote control (phone) for live |
| https://quadient-stress-staging-2.vercel.app/?remote | `staging-2` | Remote control (phone) for staging |

**PIN for remote:** `5014`

---

## Git Branch Strategy

| Branch | Deployed to | Purpose |
|--------|------------|---------|
| `main` | quadient-stress-dashboard.vercel.app | Production — stable, client-facing |
| `staging-2` | quadient-stress-staging-2.vercel.app | Staging — zone sensitivity + BLE experiments |

**Key difference staging-2 vs main:**
- `staging-2` has office-calibrated HR zone thresholds (not exercise zones)
- `staging-2` has colour unification fix (all visuals keyed to `stableZone`)
- `staging-2` has improved BLE sensor contact filtering

**Never merge staging-2 into main without explicit instruction from John.**

---

## Deployment Process — CRITICAL

### Always deploy via git push (NOT local builds)

Local `vercel build --prebuilt` does NOT have access to encrypted Vercel env vars.
This causes `VITE_REMOTE_PIN` to fall back to the default `5014` — which happens to be correct,
but Firebase keys will be missing, breaking the remote sync entirely.

**Correct process:**
```bash
# 1. Make changes, build locally to verify no errors
npm run build

# 2. Commit and push to the correct branch
git add <files>
git commit -m "message"
git push origin staging-2   # or main

# 3. Vercel auto-deploys from GitHub with correct env vars (takes ~15s)
# 4. Verify the alias is pointing to the new deployment:
vercel alias list --scope john-2408s-projects | grep staging-2
```

**If staging-2 alias needs updating manually:**
```bash
# Get the latest preview deployment URL from:
vercel list quadient-stress-dashboard --scope john-2408s-projects | head -8
# Then alias it:
vercel alias set <new-deployment-url> quadient-stress-staging-2.vercel.app --scope john-2408s-projects
```

**Env vars are pulled like this (for reference only — don't build locally for deploy):**
```bash
vercel env pull .env.production.local --environment production --scope john-2408s-projects
```

---

## Architecture — How Zone/Colour Works

All colour-changing elements must derive from a **single source of truth**: `stableZone` in `App.tsx`.

```
rawBPM (from BLE/dummy)
  → smoothedBPM (4-reading rolling average)
  → visualBPM = computeVisualBPM(smoothedBPM, baseline, multiplier, bpmOffset)
  → zone = getHRZone(visualBPM)
  → stableZone (500ms debounce — prevents flickering)
  → stressColor = getZoneColor(stableZone)
```

**Every visual** — waveform colour, ring colour, heartbeat colour, zone bar, pun text, background glow — must use `stressColor` or `stableZone`. Never compute zone independently inside a child component.

### Zone thresholds (staging-2 / office-calibrated)

| Zone | BPM range | Label | Colour |
|------|-----------|-------|--------|
| 1 | < 72 | COMPOSED | #05B9F0 (q-Blue) |
| 2 | 72–82 | AWARE | #7536F0 (q-Violet) |
| 3 | 83–94 | TENSE | #FF4200 (q-Orange) |
| 4 | 95–111 | STRESSED | #CC3400 |
| 5 | ≥ 112 | OVERLOADED | #8B1A00 |

### Remote sync architecture

- Dashboard (`App.tsx`) pushes BPM to Firebase every **1s** via `visualBPMRef.current`
- `visualBPMRef` is a ref kept in sync with `visualBPM` on every render — avoids stale closure
- Remote (`RemoteControl.tsx`) reads Firebase via `onStatus()` listener
- Nudge buttons (`+`/`−`) call `sendBpmNudge()` → Firebase → `onRemoteBpmNudge()` listener in `App.tsx` → adjusts `bpmOffset` by ±2 BPM (max ±120/−40)

---

## Open Issues (as of 2026-04-10)

### 🔴 Critical

- **[ISSUE-1] staging-2 alias may lag behind latest git push**  
  The `quadient-stress-staging-2.vercel.app` alias is manually managed and can fall behind.  
  After every push to `staging-2`, verify the alias points to the latest Preview deployment.  
  `vercel alias list --scope john-2408s-projects | grep staging-2`

- **[ISSUE-2] Remote BPM not real-time**  
  Fix was pushed (2026-04-10: `visualBPMRef` + 1s interval) but staging-2 alias may not be pointing to it yet.  
  Need to confirm alias is pointing to commit `043fcaa` or later.

- **[ISSUE-3] Staging-2 lost Zone Sensitivity UI**  
  The zone sensitivity selector (UI for adjusting thresholds) is missing from staging-2.  
  The thresholds are hardcoded in `src/types/index.ts` `getHRZone()`.  
  Need to clarify with John whether this was a separate operator panel UI or just the hardcoded values.

### 🟡 Needs verification

- **[ISSUE-4] Wristband colour consistency on staging-2**  
  Colour unification fix was applied (commit `6f9c8c7`) but hasn't been confirmed working with a live wristband.  
  Demo data works. Real BLE readings need an in-person test to confirm all visuals change together.

- **[ISSUE-5] Remote +/− buttons**  
  Restored in commit `cf32b95` (staging-2) and `fc93741` (main). Should be present.  
  Visible only during an active session. Confirm they appear after pressing Start Session.

- **[ISSUE-6] Invalid PIN on remote after some deploys**  
  Caused by local `--prebuilt` deploys missing env vars. Resolved by switching to git-push deploys.  
  PIN is always `5014`. If this reappears, the deployment was done locally — redo via git push.

### ✅ Resolved

- Colour inconsistency between waveform, ring, and zone bar during BLE sessions → fixed `6f9c8c7`
- BPMDisplay computing zone independently → fixed, now receives `stableZone` as prop
- Waveform computing colour internally → fixed, now receives `color` prop from App
- `+`/`−` nudge buttons lost in revert → restored `cf32b95` / `fc93741`

---

## Key Files

| File | Purpose |
|------|---------|
| `src/types/index.ts` | Zone thresholds, colour map, zone labels, `computeVisualBPM` |
| `src/App.tsx` | Single source of truth for `stableZone`, `stressColor`, Firebase push |
| `src/services/remoteSync.ts` | Firebase read/write: commands, nudge, status push |
| `src/components/BPMDisplay.tsx` | Right-hand dial — receives `zone` prop, never computes independently |
| `src/components/StressGauge.tsx` | Left-hand zone bar — receives `stableZone` prop |
| `src/components/Waveform.tsx` | ECG waveform — receives `color` prop |
| `src/components/RemoteControl.tsx` | Phone remote UI — +/− buttons, session controls |
| `src/services/ble.ts` | Polar BLE connection + HR parsing |
| `src/services/dummyData.ts` | Demo data autoplay (3-min cycle through zones) |

---

## Stack

React, TypeScript, Vite, Tailwind v4, Web Bluetooth API, Firebase Realtime Database  
Node.js binary at `~/bin/node/bin/node`

---

## Key Commands

```bash
npx vite --host --port 5173   # dev server (exposes to LAN for device testing)
npm run build                  # type-check + production build
npx tsc --noEmit               # type check only
vercel alias list --scope john-2408s-projects | grep staging  # check aliases
```

---

## Active MCP Servers

| Server | Purpose |
|--------|---------|
| context7 | React / Vite / TypeScript / Tailwind docs lookup |

## Active Plugins

| Plugin | When to use |
|--------|-------------|
| playwright | UI testing, screenshot capture, visual regression |

---

## Notes

- Vercel project: `quadient-stress-dashboard` under `john-2408s-projects`
- `main` auto-deploys to production on push via Vercel GitHub integration
- `staging-2` auto-deploys to a preview URL on push — but the `quadient-stress-staging-2.vercel.app` alias must be manually updated
- Billing: client project — track time against Quadient account
- Bluetooth BPM is a **proxy metric** — never label as validated HRV
- Web Bluetooth only works over HTTPS or localhost
