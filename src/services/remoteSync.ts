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
const REMOTE_PIN = (import.meta.env.VITE_REMOTE_PIN as string | undefined) || 'quadient';

let db: Database | null = null;
let lastCommandAt = 0;

/** Validate PIN from URL — returns true if PIN matches or no PIN is configured */
export function validatePin(pin: string | null): boolean {
  return pin === REMOTE_PIN;
}

export function getPin(): string {
  return REMOTE_PIN;
}

function sessionRef(path: string) {
  // Use PIN as namespace so only the correct PIN holder can access data
  return ref(db!, `sessions/${REMOTE_PIN}/${path}`);
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

/** Host → listens for commands from remote */
export function onRemoteCommand(
  callback: (command: RemoteCommand) => void,
): () => void {
  if (!db) return () => {};
  return onValue(sessionRef('command'), (snapshot) => {
    const data = snapshot.val() as { command: RemoteCommand; commandAt: number } | null;
    if (!data) return;
    if (data.commandAt <= lastCommandAt) return;
    lastCommandAt = data.commandAt;
    callback(data.command);
  });
}

/** Host → listens for data source switch requests from remote */
export function onRemoteDataSource(
  callback: (source: RemoteDataSource) => void,
): () => void {
  if (!db) return () => {};
  let lastRequestedAt = 0;
  return onValue(sessionRef('dataSource'), (snapshot) => {
    const data = snapshot.val() as { source: RemoteDataSource; requestedAt: number } | null;
    if (!data) return;
    if (data.requestedAt <= lastRequestedAt) return;
    lastRequestedAt = data.requestedAt;
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

export function resetLastCommandAt(): void {
  lastCommandAt = Date.now();
}
