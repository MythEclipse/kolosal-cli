/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import { getGlobalSessionManager } from '../core/sessionManager.js';

/**
 * CLI Session Command
 * Manages conversation sessions.
 */
export interface SessionListOptions {
  /** Maximum sessions to show */
  limit?: number;
  /** Output format */
  format?: 'text' | 'json';
}

/**
 * Format timestamp to readable date
 */
function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

/**
 * Format relative time
 */
function formatRelative(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

/**
 * List all sessions
 */
export function listSessions(options: SessionListOptions = {}): void {
  const manager = getGlobalSessionManager();
  const sessions = manager.listSessions();
  const limit = options.limit || 20;
  const displayed = sessions.slice(0, limit);

  if (options.format === 'json') {
    console.log(JSON.stringify(displayed, null, 2));
    return;
  }

  if (displayed.length === 0) {
    console.log('\n📭 No sessions found.\n');
    return;
  }

  console.log('\n╔═════════════════════════════════════════════════════════╗');
  console.log('║              📚 Kolosal AI Sessions                     ║');
  console.log('╠═════════════════════════════════════════════════════════╣\n');

  for (const session of displayed) {
    console.log(`📁 ${session.id}`);
    console.log(`   Messages: ${session.messageCount}`);
    console.log(`   Last Activity: ${formatRelative(session.lastActivityAt)}`);
    console.log(`   Created: ${formatDate(session.createdAt)}`);
    console.log('');
  }

  if (sessions.length > limit) {
    console.log(`   ... and ${sessions.length - limit} more sessions.`);
    console.log('');
  }

  console.log('╚═════════════════════════════════════════════════════════╝\n');
}

/**
 * Show session details
 */
export function showSession(sessionId: string): void {
  const manager = getGlobalSessionManager();
  const session = manager.getOrCreateSession(sessionId);

  console.log('\n📁 Session Details');
  console.log('══════════════════════════════════════════════════════════');
  console.log(`ID:         ${session.id}`);
  console.log(`Created:    ${formatDate(session.createdAt)}`);
  console.log(`Last Used:  ${formatDate(session.lastActivityAt)}`);
  console.log(`Messages:   ${session.history.length}`);
  console.log(`Model:      ${session.model || 'N/A'}`);
  console.log(`Tokens:     ${session.totalTokens?.toLocaleString() || 'N/A'}`);

  if (Object.keys(session.metadata).length > 0) {
    console.log(`Metadata:   ${JSON.stringify(session.metadata)}`);
  }
  console.log('══════════════════════════════════════════════════════════\n');
}

/**
 * Delete a session
 */
export function deleteSession(sessionId: string): void {
  const manager = getGlobalSessionManager();
  manager.deleteSession(sessionId);
  console.log(`✅ Session "${sessionId}" deleted.`);
}

/**
 * Delete all sessions
 */
export function clearAllSessions(): void {
  const manager = getGlobalSessionManager();
  manager.clearAll();
  console.log('✅ All sessions cleared.');
}

/**
 * Export session to file
 */
export function exportSession(sessionId: string, filePath?: string): void {
  const manager = getGlobalSessionManager();
  const exported = manager.exportSession(sessionId);

  if (!exported) {
    console.error(`❌ Session "${sessionId}" not found.`);
    return;
  }

  if (filePath) {
    fs.writeFileSync(filePath, exported);
    console.log(`✅ Session exported to ${filePath}`);
  } else {
    console.log(exported);
  }
}

/**
 * Cleanup expired sessions
 */
export function cleanupSessions(): void {
  const manager = getGlobalSessionManager();
  const deleted = manager.cleanup();
  console.log(`✅ Cleaned up ${deleted} expired session(s).`);
}
