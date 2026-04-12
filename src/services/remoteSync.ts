/**
 * Remote sync via Firebase Realtime Database.
 * If VITE_FIREBASE_DATABASE_URL is not set, all functions are no-ops
 * and the app works in local-only mode.
 *
 * Security: set VITE_REMOTE_PIN in env vars. The remote URL must include
 * ?remote=PIN. The PIN is used as the Firebase path prefix so only holders
 * of the correct PIN can read/write session data.
 */
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, onValue, type Database } from 'firebase/database';

export type RemoteCommand = 'start' | 'end' | 'reset';
export type RemoteDataSource = 'dummy' | 'ble';

const DATABASE_URL = import.meta.env.VITE_FIREBASE_DATABASE_URL as string | undefined;
const REMOTE_PIN = ((import.meta.env.VITE_REMOTE_PIN as string | undefined) || '5014').trim();
// Namespace isolates Firebase data per deployment — 'live' for production, 'staging' for staging-2.
// Set VITE_ENV_NAMESPACE in Vercel environment variables per deployment.
const ENV_NAMESPACE = ((import.meta.env.VITE_ENV_NAMESPACE as string | undefined) || 'live').trim();

let db: Database | null = null;
let activePin = REMOTE_PIN;

export function setActivePin(pin: string): void {
  activePin = pin;
}

/** Validate PIN from URL — returns true if PIN matches or no PIN is configured */
export function validatePin(pin: string | null): boolean {
  return pin === REMOTE_PIN;
}

export function getPin(): string {
  return REMOTE_PIN;
}

function sessionRef(path: string) {
  // ENV_NAMESPACE isolates live vs staging. PIN restricts access within that namespace.
  return ref(db!, `sessions/${ENV_NAMESPACE}/${activePin}/${path}`);
}

export function initRemoteSync(): boolean {
  if (!DATABASE_URL) return false;
  try {
    const app = initializeApp({
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      databaseURL: DATABASE_URL,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    });
    db = getDatabase(app);
    return true;
  } catch {
    return false;
  }
}

export function isRemoteSyncEnabled(): boolean {
  return db !== null;
}

/** Remote controller → sends a session command */
export function sendCommand(command: RemoteCommand): void {
  if (!db) return;
  set(sessionRef('command'), { command, commandAt: Date.now() });
}

/** Remote controller → requests a data source switch */
export function sendDataSource(source: RemoteDataSource): void {
  if (!db) return;
  set(sessionRef('dataSource'), { source, requestedAt: Date.now() });
}

/** Host → pushes live status so remote can display it */
export function pushStatus(bpm: number, sessionState: string, dataSource: string, connectionState: string): void {
  if (!db) return;
  set(sessionRef('status'), { bpm, sessionState, dataSource, connectionState, updatedAt: Date.now() });
}

/** Remote controller → nudges BPM offset up or down */
export function sendBpmNudge(direction: 'up' | 'down'): void {
  if (!db) return;
  set(sessionRef('bpmNudge'), { direction, nudgedAt: Date.now() });
}

/** Host → listens for BPM nudge requests from remote */
export function onRemoteBpmNudge(
  callback: (direction: 'up' | 'down') => void,
): () => void {
  if (!db) return () => {};
  let seenNudgedAt: number | null = null;
  return onValue(sessionRef('bpmNudge'), (snapshot) => {
    const data = snapshot.val() as { direction: 'up' | 'down'; nudgedAt: number } | null;
    if (!data) { seenNudgedAt = null; return; }
    if (seenNudgedAt === null) { seenNudgedAt = data.nudgedAt; return; }
    if (data.nudgedAt <= seenNudgedAt) return;
    seenNudgedAt = data.nudgedAt;
    callback(data.direction);
  });
}

/** Host → listens for commands from remote */
export function onRemoteCommand(
  callback: (command: RemoteCommand) => void,
): () => void {
  if (!db) return () => {};
  let seenCommandAt: number | null = null;
  return onValue(sessionRef('command'), (snapshot) => {
    const data = snapshot.val() as { command: RemoteCommand; commandAt: number } | null;
    if (!data) { seenCommandAt = null; return; }
    // First call: record existing value to avoid replaying stale commands
    if (seenCommandAt === null) { seenCommandAt = data.commandAt; return; }
    if (data.commandAt <= seenCommandAt) return;
    seenCommandAt = data.commandAt;
    callback(data.command);
  });
}

/** Host → listens for data source switch requests from remote */
export function onRemoteDataSource(
  callback: (source: RemoteDataSource) => void,
): () => void {
  if (!db) return () => {};
  let seenRequestedAt: number | null = null;
  return onValue(sessionRef('dataSource'), (snapshot) => {
    const data = snapshot.val() as { source: RemoteDataSource; requestedAt: number } | null;
    if (!data) { seenRequestedAt = null; return; }
    if (seenRequestedAt === null) { seenRequestedAt = data.requestedAt; return; }
    if (data.requestedAt <= seenRequestedAt) return;
    seenRequestedAt = data.requestedAt;
    callback(data.source);
  });
}

/** Remote → listens for live status from host */
export function onStatus(
  callback: (bpm: number, sessionState: string, dataSource: string, connectionState: string) => void,
): () => void {
  if (!db) return () => {};
  return onValue(sessionRef('status'), (snapshot) => {
    const data = snapshot.val() as {
      bpm: number; sessionState: string; dataSource: string; connectionState: string;
    } | null;
    if (data) callback(data.bpm, data.sessionState, data.dataSource, data.connectionState);
  });
}

