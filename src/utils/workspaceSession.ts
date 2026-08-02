/**
 * Workspace / session persistence for multi-connection GUI state.
 * Passwords stay in OS keychain; this only stores UI session metadata.
 */

import { ConnectionConfig, WorkspaceTab } from '../types';

const SESSION_KEY = 'devdash_workspace_session_v2';

export interface WorkspaceSession {
  version: 2;
  savedAt: string;
  activeConnectionId: string | null;
  connectedIds: string[];
  tabs: WorkspaceTab[];
  activeTabId: string;
  showWelcome: boolean;
  /** Lightweight connection metadata (no secrets) */
  connections: ConnectionConfig[];
  recentConnectionIds: string[];
}

export function saveWorkspaceSession(session: Omit<WorkspaceSession, 'version' | 'savedAt'>): void {
  try {
    const payload: WorkspaceSession = {
      version: 2,
      savedAt: new Date().toISOString(),
      ...session,
      // Strip any accidental secrets
      connections: session.connections.map((c) => ({
        ...c,
        // ensure we never persist connected flags as truth without reconnect
        is_connected: false,
      })),
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

export function loadWorkspaceSession(): WorkspaceSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorkspaceSession;
    if (!parsed || parsed.version !== 2) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearWorkspaceSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}
