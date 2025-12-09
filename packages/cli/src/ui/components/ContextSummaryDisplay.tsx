/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import {
  type IdeContext,
  type MCPServerConfig,
} from '@kolosal-ai/kolosal-ai-core';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { isNarrowWidth } from '../utils/isNarrowWidth.js';
import { ContextUsageDisplay } from './ContextUsageDisplay.js';

interface ContextSummaryDisplayProps {
  geminiMdFileCount: number;
  contextFileNames: string[];
  mcpServers?: Record<string, MCPServerConfig>;
  blockedMcpServers?: Array<{ name: string; extensionName: string }>;
  showToolDescriptions?: boolean;
  ideContext?: IdeContext;
  promptTokenCount?: number;
  model?: string;
}

export const ContextSummaryDisplay: React.FC<ContextSummaryDisplayProps> = ({
  geminiMdFileCount,
  contextFileNames,
  mcpServers,
  blockedMcpServers,
  showToolDescriptions,
  ideContext,
  promptTokenCount,
  model,
}) => {
  const { columns: terminalWidth } = useTerminalSize();
  const isNarrow = isNarrowWidth(terminalWidth);
  const mcpServerCount = Object.keys(mcpServers || {}).length;
  const blockedMcpServerCount = blockedMcpServers?.length || 0;
  const openFileCount = ideContext?.workspaceState?.openFiles?.length ?? 0;

  if (
    geminiMdFileCount === 0 &&
    mcpServerCount === 0 &&
    blockedMcpServerCount === 0 &&
    openFileCount === 0
  ) {
    return <Text> </Text>; // Render an empty space to reserve height
  }

  const openFilesText = (() => {
    if (openFileCount === 0) {
      return '';
    }
    return `${openFileCount} open file${
      openFileCount > 1 ? 's' : ''
    } (ctrl+g to view)`;
  })();

  const geminiMdText = (() => {
    if (geminiMdFileCount === 0) {
      return '';
    }
    const allNamesTheSame = new Set(contextFileNames).size < 2;
    const name = allNamesTheSame ? contextFileNames[0] : 'context';
    return `${geminiMdFileCount} ${name} file${
      geminiMdFileCount > 1 ? 's' : ''
    }`;
  })();

  const mcpText = (() => {
    if (mcpServerCount === 0 && blockedMcpServerCount === 0) {
      return '';
    }

    const parts: string[] = [];
    if (mcpServerCount > 0) {
      parts.push(
        `${mcpServerCount} MCP server${mcpServerCount > 1 ? 's' : ''}`,
      );
    }

    if (blockedMcpServerCount > 0) {
      let blockedText = `${blockedMcpServerCount} Blocked`;
      if (mcpServerCount === 0) {
        blockedText += ` MCP server${blockedMcpServerCount > 1 ? 's' : ''}`;
      }
      parts.push(blockedText);
    }
    let text = parts.join(', ');
    // Add ctrl+t hint when MCP servers are available
    if (mcpServers && Object.keys(mcpServers).length > 0) {
      if (showToolDescriptions) {
        text += ' (ctrl+t to toggle)';
      } else {
        text += ' (ctrl+t to view)';
      }
    }
    return text;
  })();

  const summaryParts = [openFilesText, geminiMdText, mcpText].filter(Boolean);

  if (isNarrow) {
    return (
      <Box flexDirection="column">
        <Text color={Colors.Gray}>Using:</Text>
        {summaryParts.map((part, index) => (
          <Text key={index} color={Colors.Gray}>
            {'  '}- {part}
          </Text>
        ))}
        {promptTokenCount !== undefined && model && (
          <Box marginLeft={2} marginTop={1}>
            <ContextUsageDisplay 
              promptTokenCount={promptTokenCount} 
              model={model} 
            />
          </Box>
        )}
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={Colors.Gray}>Using: {summaryParts.join(' | ')}</Text>
        {promptTokenCount !== undefined && model && summaryParts.length > 0 && (
          <Text color={Colors.Gray}> | </Text>
        )}
      </Box>
      {promptTokenCount !== undefined && model && (
        <Box marginLeft={2}>
          <ContextUsageDisplay 
            promptTokenCount={promptTokenCount} 
            model={model} 
          />
        </Box>
      )}
    </Box>
  );
};
