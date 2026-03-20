import { openDB, type IDBPDatabase } from 'idb';
import type { SessionData, AggregatedStats } from '../types';

const DB_NAME = 'quadient-stress';
const DB_VERSION = 1;
const STORE_NAME = 'sessions';

let dbInstance: IDBPDatabase | null = null;

async function getDB(): Promise<IDBPDatabase> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('startTime', 'startTime');
      }
    },
  });

  return dbInstance;
}

export async function saveSession(session: SessionData): Promise<void> {
  const db = await getDB();
  // Strip readings array for storage to save space — keep only stats
  const stored = {
    ...session,
    readings: [], // Don't persist every reading
  };
  await db.put(STORE_NAME, stored);
}

export async function getSessions(): Promise<SessionData[]> {
  const db = await getDB();
  return db.getAllFromIndex(STORE_NAME, 'startTime');
}

export async function getTodaySessions(): Promise<SessionData[]> {
  const all = await getSessions();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  return all.filter((s) => s.startTime >= todayStart.getTime());
}

export async function getAggregatedStats(): Promise<AggregatedStats> {
  const sessions = await getTodaySessions();

  if (sessions.length === 0) {
    return {
      totalSessions: 0,
      avgPeakHR: 0,
      avgAvgHR: 0,
      highestHR: 0,
      avgSessionDuration: 0,
    };
  }

  const completed = sessions.filter((s) => s.endTime);
  const totalSessions = completed.length;

  if (totalSessions === 0) {
    return {
      totalSessions: 0,
      avgPeakHR: 0,
      avgAvgHR: 0,
      highestHR: 0,
      avgSessionDuration: 0,
    };
  }

  const avgPeakHR = Math.round(
    completed.reduce((sum, s) => sum + s.maxHR, 0) / totalSessions
  );
  const avgAvgHR = Math.round(
    completed.reduce((sum, s) => sum + s.avgHR, 0) / totalSessions
  );
  const highestHR = Math.max(...completed.map((s) => s.maxHR));
  const avgSessionDuration = Math.round(
    completed.reduce((sum, s) => sum + ((s.endTime! - s.startTime) / 1000), 0) / totalSessions
  );

  return { totalSessions, avgPeakHR, avgAvgHR, highestHR, avgSessionDuration };
}

export async function clearAllSessions(): Promise<void> {
  const db = await getDB();
  await db.clear(STORE_NAME);
}

export async function exportSessionsCSV(): Promise<string> {
  const sessions = await getSessions();
  const headers = ['ID', 'Start Time', 'End Time', 'Duration (s)', 'Min HR', 'Avg HR', 'Max HR'];
  const rows = sessions.map((s) => [
    s.id,
    new Date(s.startTime).toISOString(),
    s.endTime ? new Date(s.endTime).toISOString() : '',
    s.endTime ? Math.round((s.endTime - s.startTime) / 1000) : '',
    s.minHR,
    s.avgHR,
    s.maxHR,
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}
