// packages/core/src/services/metricsReportingService.ts

/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */


export interface PerformanceMetrics {
  executionTime: number;
  memoryUsage: number;
  cpuUsage: number;
  networkRequests: number;
  errorCount: number;
  retryCount: number;
  toolUsage: Record<string, number>;
  stepMetrics: Array<{
    stepId: string;
    duration: number;
    success: boolean;
    attempts: number;
  }>;
}

export interface UsageMetrics {
  totalSessions: number;
  totalExecutions: number;
  averageSessionDuration: number;
  popularCommands: Record<string, number>;
  userRetention: number;
  featureAdoption: Record<string, number>;
  errorRates: Record<string, number>;
}

export interface QualityMetrics {
  testCoverage: number;
  lintScore: number;
  securityScore: number;
  performanceScore: number;
  reliabilityScore: number;
  userSatisfaction: number;
}

export interface MetricsReport {
  timestamp: Date;
  period: {
    start: Date;
    end: Date;
  };
  performance: PerformanceMetrics;
  usage: UsageMetrics;
  quality: QualityMetrics;
  insights: string[];
  recommendations: string[];
}

export class MetricsReportingService {
  private metricsHistory: MetricsReport[] = [];
  private readonly maxHistorySize = 100;
  private currentMetrics: Partial<PerformanceMetrics> = {};

  constructor() {}

  /**
   * Records performance metrics for an execution
   */
  recordExecutionMetrics(
    executionId: string,
    metrics: Partial<PerformanceMetrics>
  ): void {
    Object.assign(this.currentMetrics, metrics);
    console.log(`Metrics recorded for execution: ${executionId}`);
  }

  /**
   * Starts collecting metrics for a session
   */
  startSessionMetrics(sessionId: string): void {
    this.currentMetrics = {
      executionTime: 0,
      memoryUsage: 0,
      cpuUsage: 0,
      networkRequests: 0,
      errorCount: 0,
      retryCount: 0,
      toolUsage: {},
      stepMetrics: []
    };
    console.log(`Started metrics collection for session: ${sessionId}`);
  }

  /**
   * Stops collecting metrics and generates a report
   */
  endSessionMetrics(sessionId: string): MetricsReport {
    const report = this.generateMetricsReport();
    this.metricsHistory.push(report);

    // Maintain history limit
    if (this.metricsHistory.length > this.maxHistorySize) {
      this.metricsHistory = this.metricsHistory.slice(-this.maxHistorySize);
    }

    console.log(`Generated metrics report for session: ${sessionId}`);
    return report;
  }

  /**
   * Records a tool usage event
   */
  recordToolUsage(toolName: string, executionTime: number): void {
    if (!this.currentMetrics.toolUsage) {
      this.currentMetrics.toolUsage = {};
    }

    this.currentMetrics.toolUsage![toolName] = (this.currentMetrics.toolUsage![toolName] || 0) + 1;
    this.currentMetrics.executionTime = (this.currentMetrics.executionTime || 0) + executionTime;
  }

  /**
   * Records an error event
   */
  recordError(errorType: string, context?: Record<string, unknown>): void {
    this.currentMetrics.errorCount = (this.currentMetrics.errorCount || 0) + 1;
    console.log(`Error recorded: ${errorType}`, context);
  }

  /**
   * Records a retry event
   */
  recordRetry(stepId: string, attemptNumber: number): void {
    this.currentMetrics.retryCount = (this.currentMetrics.retryCount || 0) + 1;

    if (!this.currentMetrics.stepMetrics) {
      this.currentMetrics.stepMetrics = [];
    }

    const stepMetric = this.currentMetrics.stepMetrics.find(s => s.stepId === stepId);
    if (stepMetric) {
      stepMetric.attempts = attemptNumber;
    }
  }

  /**
   * Records step completion metrics
   */
  recordStepMetrics(
    stepId: string,
    duration: number,
    success: boolean,
    attempts: number
  ): void {
    if (!this.currentMetrics.stepMetrics) {
      this.currentMetrics.stepMetrics = [];
    }

    this.currentMetrics.stepMetrics.push({
      stepId,
      duration,
      success,
      attempts
    });
  }

  /**
   * Generates a comprehensive metrics report
   */
  generateMetricsReport(): MetricsReport {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const report: MetricsReport = {
      timestamp: now,
      period: {
        start: oneHourAgo,
        end: now
      },
      performance: {
        executionTime: this.currentMetrics.executionTime || 0,
        memoryUsage: this.currentMetrics.memoryUsage || 0,
        cpuUsage: this.currentMetrics.cpuUsage || 0,
        networkRequests: this.currentMetrics.networkRequests || 0,
        errorCount: this.currentMetrics.errorCount || 0,
        retryCount: this.currentMetrics.retryCount || 0,
        toolUsage: this.currentMetrics.toolUsage || {},
        stepMetrics: this.currentMetrics.stepMetrics || []
      },
      usage: this.calculateUsageMetrics(),
      quality: this.calculateQualityMetrics(),
      insights: [],
      recommendations: []
    };

    // Generate insights and recommendations
    report.insights = this.generateInsights(report);
    report.recommendations = this.generateRecommendations(report);

    return report;
  }

  /**
   * Gets historical metrics reports
   */
  getHistoricalReports(limit: number = 10): MetricsReport[] {
    return this.metricsHistory.slice(-limit);
  }

  /**
   * Gets aggregated metrics over a time period
   */
  getAggregatedMetrics(hours: number = 24): {
    averageExecutionTime: number;
    totalErrors: number;
    totalRetries: number;
    mostUsedTools: Array<{ tool: string; usage: number }>;
    successRate: number;
  } {
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    const relevantReports = this.metricsHistory.filter(r => r.timestamp >= cutoffTime);

    if (relevantReports.length === 0) {
      return {
        averageExecutionTime: 0,
        totalErrors: 0,
        totalRetries: 0,
        mostUsedTools: [],
        successRate: 0
      };
    }

    const totalExecutionTime = relevantReports.reduce((sum, r) => sum + r.performance.executionTime, 0);
    const totalErrors = relevantReports.reduce((sum, r) => sum + r.performance.errorCount, 0);
    const totalRetries = relevantReports.reduce((sum, r) => sum + r.performance.retryCount, 0);

    const toolUsageMap = new Map<string, number>();
    relevantReports.forEach(report => {
      Object.entries(report.performance.toolUsage).forEach(([tool, usage]) => {
        toolUsageMap.set(tool, (toolUsageMap.get(tool) || 0) + usage);
      });
    });

    const mostUsedTools = Array.from(toolUsageMap.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([tool, usage]) => ({ tool, usage }));

    const totalSteps = relevantReports.reduce((sum, r) => sum + r.performance.stepMetrics.length, 0);
    const successfulSteps = relevantReports.reduce((sum, r) =>
      sum + r.performance.stepMetrics.filter(s => s.success).length, 0);
    const successRate = totalSteps > 0 ? (successfulSteps / totalSteps) * 100 : 0;

    return {
      averageExecutionTime: totalExecutionTime / relevantReports.length,
      totalErrors,
      totalRetries,
      mostUsedTools,
      successRate
    };
  }

  /**
   * Exports metrics data
   */
  exportMetrics(format: 'json' | 'csv' = 'json'): string {
    const data = this.getAggregatedMetrics(168); // Last 7 days

    if (format === 'csv') {
      const headers = ['metric', 'value'];
      const rows = [
        ['averageExecutionTime', data.averageExecutionTime.toString()],
        ['totalErrors', data.totalErrors.toString()],
        ['totalRetries', data.totalRetries.toString()],
        ['successRate', data.successRate.toString()],
        ...data.mostUsedTools.flatMap(tool => [
          [`tool_${tool.tool}`, tool.usage.toString()]
        ])
      ];

      return [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    }

    return JSON.stringify(data, null, 2);
  }

  private calculateUsageMetrics(): UsageMetrics {
    // This would be populated with actual usage data
    // For now, return placeholder values
    return {
      totalSessions: 0,
      totalExecutions: 0,
      averageSessionDuration: 0,
      popularCommands: {},
      userRetention: 0,
      featureAdoption: {},
      errorRates: {}
    };
  }

  private calculateQualityMetrics(): QualityMetrics {
    // This would be calculated from actual quality checks
    // For now, return placeholder values
    return {
      testCoverage: 0,
      lintScore: 0,
      securityScore: 0,
      performanceScore: 0,
      reliabilityScore: 0,
      userSatisfaction: 0
    };
  }

  private generateInsights(report: MetricsReport): string[] {
    const insights: string[] = [];

    const { performance } = report;

    // Performance insights
    if (performance.executionTime > 300000) { // 5 minutes
      insights.push('Long execution times detected - consider optimization');
    }

    if (performance.errorCount > performance.stepMetrics.length * 0.1) {
      insights.push('High error rate - investigate failure patterns');
    }

    if (performance.retryCount > performance.stepMetrics.length * 0.5) {
      insights.push('Frequent retries - check system stability');
    }

    // Tool usage insights
    const topTools = Object.entries(performance.toolUsage)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3);

    if (topTools.length > 0) {
      insights.push(`Most used tools: ${topTools.map(([tool]) => tool).join(', ')}`);
    }

    // Step performance insights
    const slowSteps = performance.stepMetrics
      .filter(step => step.duration > 30000) // 30 seconds
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 3);

    if (slowSteps.length > 0) {
      insights.push(`Slowest steps: ${slowSteps.map(s => s.stepId).join(', ')}`);
    }

    return insights;
  }

  private generateRecommendations(report: MetricsReport): string[] {
    const recommendations: string[] = [];

    const { performance } = report;

    // Error handling recommendations
    if (performance.errorCount > 0) {
      recommendations.push('Implement better error handling and recovery mechanisms');
    }

    if (performance.retryCount > performance.errorCount * 2) {
      recommendations.push('Review retry strategies - excessive retries may indicate underlying issues');
    }

    // Performance recommendations
    if (performance.executionTime > 600000) { // 10 minutes
      recommendations.push('Consider breaking long executions into smaller, resumable tasks');
    }

    // Tool usage recommendations
    const toolEntries = Object.entries(performance.toolUsage);
    if (toolEntries.length > 10) {
      recommendations.push('High tool diversity - consider creating composite tools for common patterns');
    }

    // Reliability recommendations
    const failedSteps = performance.stepMetrics.filter(s => !s.success);
    if (failedSteps.length > performance.stepMetrics.length * 0.2) {
      recommendations.push('Low success rate - focus on improving step reliability');
    }

    return recommendations;
  }
}
