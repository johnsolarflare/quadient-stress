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
- `staging-2` has zone sensitivity slider in OperatorPanel (0.5×–3.0×)
- `staging-2` uses `VITE_ENV_NAMESPACE=staging` → isolated Firebase path (no live bleed)

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
# 4. ALWAYS re-alias staging-2 — preview URLs do not auto-update:
vercel list quadient-stress-dashboard --scope john-2408s-projects | head -6
vercel alias set <new-preview-url> quadient-stress-staging-2.vercel.app --scope john-2408s-projects
```

> **Note:** Production (`main`) aliases automatically. `staging-2` does NOT — the alias must be updated manually after every push or the URL stays on the old build.

**Required env vars per environment (set in Vercel dashboard):**

| Var | Production (main) | Preview (staging-2) |
|-----|-------------------|---------------------|
| `VITE_ENV_NAMESPACE` | `live` | `staging` |
| `VITE_REMOTE_PIN` | `5014` | `5014` |
| `VITE_FIREBASE_*` | (set) | (set) |

`VITE_ENV_NAMESPACE` scopes the Firebase path so live and staging never share session data.
**If this var is missing, it defaults to `live` — staging would bleed into live Firebase.**

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
  → displayBPM = clamp(smoothedBPM + bpmOffset, 40, 220)   ← shown on screen, drives waveform/pulse speed
  → zoneBPM = computeVisualBPM(smoothedBPM, baseline, sensitivityMultiplier, bpmOffset)  ← internal only
  → zone = getHRZone(zoneBPM)
  → stableZone (500ms debounce — prevents flickering)
  → stressColor = getZoneColor(stableZone)
```

**Key invariant:** `displayBPM` is the only value ever shown to users as a BPM number. It is the raw sensor value + operator offset. Zone sensitivity (`sensitivityMultiplier`) is applied to `zoneBPM` only — it never touches the displayed number or waveform speed.

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
- `visualBPMRef` is a ref kept in sync with `displayBPM` on every render — avoids stale closure; pushes the display value (not the amplified zone value)
- Remote (`RemoteControl.tsx`) reads Firebase via `onStatus()` listener
- Nudge buttons (`+`/`−`) call `sendBpmNudge()` → Firebase → `onRemoteBpmNudge()` listener in `App.tsx` → adjusts `bpmOffset` by ±2 BPM (max ±120/−40)
- Firebase path: `sessions/${ENV_NAMESPACE}/${activePin}/...` — namespace isolates live vs staging

### Zone sensitivity

- `sensitivityMultiplier` in `App.tsx` scales BPM deviation from baseline: `baseline + (bpm - baseline) * multiplier`
- Controlled via slider in OperatorPanel (0.5×–3.0×, default 1.0×)
- Affects `visualBPM` which drives all zone/colour logic — does NOT change raw BPM display

---

## Open Issues (as of 2026-04-10)

### 🔴 Needs action (manual Vercel config)

- **[ISSUE-1] VITE_ENV_NAMESPACE not yet set in Vercel**  
  Code is deployed but the env var must be added in the Vercel dashboard for isolation to take effect.  
  **Action:** Go to Vercel → quadient-stress-dashboard → Settings → Environment Variables:  
  - Production (main): `VITE_ENV_NAMESPACE` = `live`  
  - Preview (staging-2): `VITE_ENV_NAMESPACE` = `staging`  
  Without this, staging defaults to the `live` namespace and cross-contamination continues.

### 🟡 Needs verification (in-person with live wristband)

- **[ISSUE-2] Wristband colour consistency on staging-2**  
  Colour unification fix applied (`6f9c8c7`) and code is correct. Not yet tested with live BLE.  
  Demo data confirmed working. Need real Polar sensor session to validate all visuals sync together.

- **[ISSUE-3] Remote +/− buttons**  
  Restored (`cf32b95`). Visible only during active session. Confirm they appear after Start Session.

### ✅ Resolved (2026-04-10)

- Cross-environment Firebase interference → fixed `a621a4c` (ENV_NAMESPACE isolation)
- Zone sensitivity UI missing → fixed `a621a4c` (0.5×–3.0× slider in OperatorPanel)
- BPMDisplay showing amplified value instead of real sensor BPM → fixed `da7f4e9`
- staging-2 alias updated to `n7ireq0dk` (commit `da7f4e9`, 2026-04-10)
- Remote BPM lag → fixed `043fcaa` (visualBPMRef + 1s push interval)
- Colour inconsistency (waveform/ring/zone bar) → fixed `6f9c8c7` (stableZone as single source)
- BPMDisplay computing zone independently → fixed, receives `stableZone` as prop
- Waveform computing colour internally → fixed, receives `color` prop from App
- `+`/`−` nudge buttons lost in revert → restored `cf32b95` / `fc93741`
- Invalid PIN on remote after local deploys → resolved, always push via git
- **Zone sensitivity affecting displayed BPM + pulse speed** → fixed `(pending commit)` — introduced `displayBPM = smoothedBPM + bpmOffset`; sensitivity only drives internal zone calc
- **W/S manual BPM adjustment not visibly changing BPM number** → fixed same commit — `displayBPM` (not raw `smoothedBPM`) is now what's shown, so offset is visible

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
