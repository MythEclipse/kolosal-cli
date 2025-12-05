// packages/core/src/services/feedbackService.ts

/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';

export enum FeedbackType {
  RATING = 'rating',
  COMMENT = 'comment',
  ISSUE = 'issue',
  SUGGESTION = 'suggestion',
  BUG_REPORT = 'bug_report'
}

export enum FeedbackPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface UserFeedback {
  id: string;
  sessionId: string;
  executionId?: string;
  type: FeedbackType;
  priority: FeedbackPriority;
  title: string;
  description: string;
  metadata: Record<string, unknown>;
  timestamp: Date;
  userContext?: {
    platform: string;
    version: string;
    userId?: string;
  };
  resolved: boolean;
  resolution?: string;
  resolvedAt?: Date;
}

export interface FeedbackAnalysis {
  totalFeedback: number;
  averageRating?: number;
  feedbackByType: Record<FeedbackType, number>;
  feedbackByPriority: Record<FeedbackPriority, number>;
  commonIssues: Array<{
    issue: string;
    count: number;
    averagePriority: number;
  }>;
  trends: {
    feedbackOverTime: Array<{ date: string; count: number }>;
    satisfactionTrend: number[]; // -1 to 1 scale
  };
  recommendations: string[];
}

export class FeedbackService {
  private feedback: UserFeedback[] = [];
  private readonly maxFeedbackHistory = 1000;

  constructor(private readonly config: Config) {}

  /**
   * Submits user feedback
   */
  submitFeedback(feedback: Omit<UserFeedback, 'id' | 'timestamp' | 'resolved'>): string {
    const id = `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const fullFeedback: UserFeedback = {
      ...feedback,
      id,
      timestamp: new Date(),
      resolved: false
    };

    this.feedback.push(fullFeedback);

    // Maintain history limit
    if (this.feedback.length > this.maxFeedbackHistory) {
      this.feedback = this.feedback.slice(-this.maxFeedbackHistory);
    }

    console.log(`Feedback submitted: ${id} - ${feedback.title}`);
    return id;
  }

  /**
   * Gets feedback by various criteria
   */
  getFeedback(options: {
    sessionId?: string;
    executionId?: string;
    type?: FeedbackType;
    priority?: FeedbackPriority;
    resolved?: boolean;
    limit?: number;
    offset?: number;
  } = {}): UserFeedback[] {
    let filtered = this.feedback;

    if (options.sessionId) {
      filtered = filtered.filter(f => f.sessionId === options.sessionId);
    }

    if (options.executionId) {
      filtered = filtered.filter(f => f.executionId === options.executionId);
    }

    if (options.type) {
      filtered = filtered.filter(f => f.type === options.type);
    }

    if (options.priority) {
      filtered = filtered.filter(f => f.priority === options.priority);
    }

    if (options.resolved !== undefined) {
      filtered = filtered.filter(f => f.resolved === options.resolved);
    }

    // Sort by timestamp (newest first)
    filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    const offset = options.offset || 0;
    const limit = options.limit || filtered.length;

    return filtered.slice(offset, offset + limit);
  }

  /**
   * Resolves feedback
   */
  resolveFeedback(feedbackId: string, resolution: string): boolean {
    const feedback = this.feedback.find(f => f.id === feedbackId);
    if (!feedback) return false;

    feedback.resolved = true;
    feedback.resolution = resolution;
    feedback.resolvedAt = new Date();

    console.log(`Feedback resolved: ${feedbackId}`);
    return true;
  }

  /**
   * Analyzes feedback patterns and trends
   */
  analyzeFeedback(): FeedbackAnalysis {
    const totalFeedback = this.feedback.length;

    // Calculate average rating
    const ratings = this.feedback
      .filter(f => f.type === FeedbackType.RATING && typeof f.metadata.rating === 'number')
      .map(f => f.metadata.rating as number);

    const averageRating = ratings.length > 0
      ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length
      : undefined;

    // Count by type and priority
    const feedbackByType: Record<FeedbackType, number> = {} as Record<FeedbackType, number>;
    const feedbackByPriority: Record<FeedbackPriority, number> = {} as Record<FeedbackPriority, number>;

    for (const feedback of this.feedback) {
      feedbackByType[feedback.type] = (feedbackByType[feedback.type] || 0) + 1;
      feedbackByPriority[feedback.priority] = (feedbackByPriority[feedback.priority] || 0) + 1;
    }

    // Find common issues
    const issueMap = new Map<string, { count: number; priorities: number[] }>();
    this.feedback
      .filter(f => f.type === FeedbackType.ISSUE || f.type === FeedbackType.BUG_REPORT)
      .forEach(f => {
        const key = f.title.toLowerCase();
        const existing = issueMap.get(key) || { count: 0, priorities: [] };
        existing.count++;
        existing.priorities.push(this.priorityToNumber(f.priority));
        issueMap.set(key, existing);
      });

    const commonIssues = Array.from(issueMap.entries())
      .map(([issue, data]) => ({
        issue,
        count: data.count,
        averagePriority: data.priorities.reduce((sum, p) => sum + p, 0) / data.priorities.length
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Calculate trends (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentFeedback = this.feedback.filter(f => f.timestamp >= thirtyDaysAgo);
    const feedbackOverTime: Array<{ date: string; count: number }> = [];

    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const count = recentFeedback.filter(f =>
        f.timestamp.toISOString().split('T')[0] === dateStr
      ).length;
      feedbackOverTime.push({ date: dateStr, count });
    }

    // Calculate satisfaction trend (simplified)
    const satisfactionTrend = feedbackOverTime.map(day => {
      const dayFeedback = recentFeedback.filter(f =>
        f.timestamp.toISOString().split('T')[0] === day.date
      );

      if (dayFeedback.length === 0) return 0;

      const positive = dayFeedback.filter(f =>
        f.type === FeedbackType.RATING &&
        typeof f.metadata.rating === 'number' &&
        (f.metadata.rating as number) >= 4
      ).length;

      const negative = dayFeedback.filter(f =>
        f.type === FeedbackType.ISSUE || f.type === FeedbackType.BUG_REPORT
      ).length;

      return (positive - negative) / dayFeedback.length;
    });

    // Generate recommendations
    const recommendations = this.generateRecommendations(commonIssues, feedbackByType, averageRating);

    return {
      totalFeedback,
      averageRating,
      feedbackByType,
      feedbackByPriority,
      commonIssues,
      trends: {
        feedbackOverTime,
        satisfactionTrend
      },
      recommendations
    };
  }

  /**
   * Gets feedback statistics
   */
  getFeedbackStats(): {
    totalFeedback: number;
    resolvedFeedback: number;
    unresolvedFeedback: number;
    averageResolutionTime: number;
    feedbackByCategory: Record<string, number>;
  } {
    const total = this.feedback.length;
    const resolved = this.feedback.filter(f => f.resolved).length;
    const unresolved = total - resolved;

    const resolvedFeedback = this.feedback.filter(f => f.resolved && f.resolvedAt);
    const averageResolutionTime = resolvedFeedback.length > 0
      ? resolvedFeedback.reduce((sum, f) => {
          const resolutionTime = f.resolvedAt!.getTime() - f.timestamp.getTime();
          return sum + resolutionTime;
        }, 0) / resolvedFeedback.length
      : 0;

    const feedbackByCategory: Record<string, number> = {};
    this.feedback.forEach(f => {
      const category = `${f.type}_${f.priority}`;
      feedbackByCategory[category] = (feedbackByCategory[category] || 0) + 1;
    });

    return {
      totalFeedback: total,
      resolvedFeedback: resolved,
      unresolvedFeedback: unresolved,
      averageResolutionTime,
      feedbackByCategory
    };
  }

  /**
   * Exports feedback data
   */
  exportFeedback(format: 'json' | 'csv' = 'json'): string {
    if (format === 'csv') {
      const headers = ['id', 'sessionId', 'executionId', 'type', 'priority', 'title', 'description', 'timestamp', 'resolved'];
      const rows = this.feedback.map(f => [
        f.id,
        f.sessionId,
        f.executionId || '',
        f.type,
        f.priority,
        f.title,
        f.description,
        f.timestamp.toISOString(),
        f.resolved.toString()
      ]);

      return [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    }

    return JSON.stringify(this.feedback, null, 2);
  }

  private priorityToNumber(priority: FeedbackPriority): number {
    switch (priority) {
      case FeedbackPriority.LOW: return 1;
      case FeedbackPriority.MEDIUM: return 2;
      case FeedbackPriority.HIGH: return 3;
      case FeedbackPriority.CRITICAL: return 4;
      default: return 2;
    }
  }

  private generateRecommendations(
    commonIssues: Array<{ issue: string; count: number; averagePriority: number }>,
    feedbackByType: Record<FeedbackType, number>,
    averageRating?: number
  ): string[] {
    const recommendations: string[] = [];

    // Rating-based recommendations
    if (averageRating !== undefined) {
      if (averageRating < 3) {
        recommendations.push('Overall satisfaction is low - focus on core functionality improvements');
      } else if (averageRating < 4) {
        recommendations.push('Good satisfaction but room for improvement - address common issues');
      } else {
        recommendations.push('High satisfaction - maintain quality and add requested features');
      }
    }

    // Issue-based recommendations
    if (commonIssues.length > 0) {
      const topIssue = commonIssues[0];
      if (topIssue.count > 5) {
        recommendations.push(`Address high-frequency issue: "${topIssue.issue}" (${topIssue.count} reports)`);
      }
    }

    // Type-based recommendations
    const bugReports = feedbackByType[FeedbackType.BUG_REPORT] || 0;
    const issues = feedbackByType[FeedbackType.ISSUE] || 0;

    if (bugReports > issues * 2) {
      recommendations.push('High bug report volume - prioritize stability improvements');
    }

    const suggestions = feedbackByType[FeedbackType.SUGGESTION] || 0;
    if (suggestions > 10) {
      recommendations.push('Many feature suggestions - consider roadmap planning based on user input');

    }

    return recommendations;
  }
}</content>
<parameter name="filePath">d:\kolosal-cli-1\packages\core\src\services\feedbackService.ts