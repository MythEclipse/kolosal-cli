/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

/**
 * Session data structure
 */
export interface SessionData {
  /** Session identifier */
  id: string;
  /** Session creation timestamp */
  createdAt: number;
  /** Last activity timestamp */
  lastActivityAt: number;
  /** Conversation history */
  history: Content[];
  /** Session metadata */
  metadata: Record<string, unknown>;
  /** Model used */
  model?: string;
  /** Total tokens used */
  totalTokens?: number;
}

/**
 * Session storage options
 */
export interface SessionStorageOptions {
  /** Directory for session storage */
  storageDir: string;
  /** Maximum sessions to keep */
  maxSessions: number;
  /** Session TTL in milliseconds (0 = no expiry) */
  sessionTtl: number;
  /** Auto-save on changes */
  autoSave: boolean;
}

const DEFAULT_OPTIONS: SessionStorageOptions = {
  storageDir: path.join(os.homedir(), '.kolosal', 'sessions'),
  maxSessions: 50,
  sessionTtl: 7 * 24 * 60 * 60 * 1000, // 7 days
  autoSave: true,
};

/**
 * Session Manager for persisting conversation state.
 */
export class SessionManager {
  private sessions: Map<string, SessionData> = new Map();
  private options: SessionStorageOptions;
  private dirty: Set<string> = new Set();

  constructor(options?: Partial<SessionStorageOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.ensureStorageDir();
  }

  /**
   * Create or get a session
   */
  getOrCreateSession(id: string): SessionData {
    if (this.sessions.has(id)) {
      return this.sessions.get(id)!;
    }

    // Try to load from disk
    const loaded = this.loadFromDisk(id);
    if (loaded) {
      this.sessions.set(id, loaded);
      return loaded;
    }

    // Create new session
    const session: SessionData = {
      id,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      history: [],
      metadata: {},
    };

    this.sessions.set(id, session);
    this.markDirty(id);
    return session;
  }

  /**
   * Update session history
   */
  updateHistory(id: string, history: Content[]): void {
    const session = this.getOrCreateSession(id);
    session.history = history;
    session.lastActivityAt = Date.now();
    this.markDirty(id);
  }

  /**
   * Add to session history
   */
  appendToHistory(id: string, content: Content): void {
    const session = this.getOrCreateSession(id);
    session.history.push(content);
    session.lastActivityAt = Date.now();
    this.markDirty(id);
  }

  /**
   * Update session metadata
   */
  updateMetadata(id: string, metadata: Record<string, unknown>): void {
    const session = this.getOrCreateSession(id);
    session.metadata = { ...session.metadata, ...metadata };
    session.lastActivityAt = Date.now();
    this.markDirty(id);
  }

  /**
   * Mark session as modified
   */
  private markDirty(id: string): void {
    this.dirty.add(id);
    if (this.options.autoSave) {
      this.save(id);
    }
  }

  /**
   * Save session to disk
   */
  save(id: string): void {
    const session = this.sessions.get(id);
    if (!session) return;

    const filePath = this.getSessionPath(id);
    fs.writeFileSync(filePath, JSON.stringify(session, null, 2));
    this.dirty.delete(id);
  }

  /**
   * Save all dirty sessions
   */
  saveAll(): void {
    for (const id of this.dirty) {
      this.save(id);
    }
  }

  /**
   * Load session from disk
   */
  private loadFromDisk(id: string): SessionData | null {
    const filePath = this.getSessionPath(id);
    try {
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf-8');
        const session = JSON.parse(data) as SessionData;

        // Check if expired
        if (this.isExpired(session)) {
          fs.unlinkSync(filePath);
          return null;
        }

        return session;
      }
    } catch {
      // Ignore parse errors
    }
    return null;
  }

  /**
   * Check if session is expired
   */
  private isExpired(session: SessionData): boolean {
    if (this.options.sessionTtl === 0) return false;
    return Date.now() - session.lastActivityAt > this.options.sessionTtl;
  }

  /**
   * Get session file path
   */
  private getSessionPath(id: string): string {
    // Sanitize ID for filename
    const safeId = id.replace(/[^a-zA-Z0-9-_]/g, '_');
    return path.join(this.options.storageDir, `${safeId}.json`);
  }

  /**
   * Ensure storage directory exists
   */
  private ensureStorageDir(): void {
    if (!fs.existsSync(this.options.storageDir)) {
      fs.mkdirSync(this.options.storageDir, { recursive: true });
    }
  }

  /**
   * Delete a session
   */
  deleteSession(id: string): void {
    this.sessions.delete(id);
    this.dirty.delete(id);

    const filePath = this.getSessionPath(id);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  /**
   * List all sessions
   */
  listSessions(): Array<{
    id: string;
    createdAt: number;
    lastActivityAt: number;
    messageCount: number;
  }> {
    this.loadAllFromDisk();

    return Array.from(this.sessions.values())
      .filter((s) => !this.isExpired(s))
      .sort((a, b) => b.lastActivityAt - a.lastActivityAt)
      .map((s) => ({
        id: s.id,
        createdAt: s.createdAt,
        lastActivityAt: s.lastActivityAt,
        messageCount: s.history.length,
      }));
  }

  /**
   * Load all sessions from disk
   */
  private loadAllFromDisk(): void {
    try {
      const files = fs.readdirSync(this.options.storageDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const id = file.replace('.json', '');
          if (!this.sessions.has(id)) {
            const session = this.loadFromDisk(id);
            if (session) {
              this.sessions.set(id, session);
            }
          }
        }
      }
    } catch {
      // Directory doesn't exist yet
    }
  }

  /**
   * Cleanup expired and excess sessions
   */
  cleanup(): number {
    this.loadAllFromDisk();

    let deleted = 0;
    const sessions = Array.from(this.sessions.entries()).sort(
      (a, b) => b[1].lastActivityAt - a[1].lastActivityAt,
    );

    for (let i = 0; i < sessions.length; i++) {
      const [id, session] = sessions[i];

      // Delete expired or excess sessions
      if (this.isExpired(session) || i >= this.options.maxSessions) {
        this.deleteSession(id);
        deleted++;
      }
    }

    return deleted;
  }

  /**
   * Get session count
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Clear all sessions
   */
  clearAll(): void {
    for (const id of Array.from(this.sessions.keys())) {
      this.deleteSession(id);
    }
  }

  /**
   * Export session to string
   */
  exportSession(id: string): string | null {
    const session = this.sessions.get(id);
    if (!session) return null;
    return JSON.stringify(session, null, 2);
  }

  /**
   * Import session from string
   */
  importSession(data: string): SessionData | null {
    try {
      const session = JSON.parse(data) as SessionData;
      if (session.id && session.history) {
        this.sessions.set(session.id, session);
        this.markDirty(session.id);
        return session;
      }
    } catch {
      // Invalid JSON
    }
    return null;
  }
}

/**
 * Global session manager
 */
let globalSessionManager: SessionManager | null = null;

export function getGlobalSessionManager(
  options?: Partial<SessionStorageOptions>,
): SessionManager {
  if (!globalSessionManager) {
    globalSessionManager = new SessionManager(options);
  }
  return globalSessionManager;
}

export function resetGlobalSessionManager(): void {
  globalSessionManager = null;
}
