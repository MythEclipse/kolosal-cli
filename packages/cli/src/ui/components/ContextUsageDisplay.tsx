/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { tokenLimit } from '@kolosal-ai/kolosal-ai-core';

export const ContextUsageDisplay = ({
  promptTokenCount,
  model,
}: {
  promptTokenCount: number;
  model: string;
}) => {
  const limit = tokenLimit(model);
  const percentage = promptTokenCount / limit;
  const remainingPercentage = 1 - percentage;
  
  // Color coding based on usage percentage
  let color = Colors.Gray;
  if (remainingPercentage < 0.1) {
    // Less than 10% context left - red warning
    color = Colors.AccentRed;
  } else if (remainingPercentage < 0.25) {
    // Less than 25% context left - yellow warning
    color = Colors.AccentYellow;
  } else if (percentage > 0.75) {
    // More than 75% context used - blue info
    color = Colors.AccentBlue;
  }

  // Create a simple progress bar visualization
  const progressBarLength = 10;
  const filledBlocks = Math.min(
    Math.round(percentage * progressBarLength),
    progressBarLength
  );
  const emptyBlocks = progressBarLength - filledBlocks;
  
  const progressBar = (
    <Text>
      [<Text color={color}>{filledBlocks > 0 ? '█'.repeat(filledBlocks) : ''}</Text>
      <Text color={Colors.Gray}>{emptyBlocks > 0 ? '░'.repeat(emptyBlocks) : ''}</Text>]
    </Text>
  );

  return (
    <Box flexDirection="column">
      <Text color={color}>
        {promptTokenCount.toLocaleString()} / {limit.toLocaleString()} tokens,{' '}
        {(remainingPercentage * 100).toFixed(0)}% context left
      </Text>
      <Box marginLeft={2}>
        {progressBar}
      </Box>
    </Box>
  );
};
