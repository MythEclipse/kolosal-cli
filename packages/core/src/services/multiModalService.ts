// packages/core/src/services/multiModalService.ts

/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export enum OutputFormat {
  TEXT = 'text',
  JSON = 'json',
  HTML = 'html',
  MARKDOWN = 'markdown',
  PDF = 'pdf',
  IMAGE = 'image',
  AUDIO = 'audio',
  VIDEO = 'video'
}

export enum OutputType {
  REPORT = 'report',
  SUMMARY = 'summary',
  LOG = 'log',
  VISUALIZATION = 'visualization',
  DOCUMENTATION = 'documentation',
  PRESENTATION = 'presentation'
}

export interface OutputContent {
  type: OutputType;
  format: OutputFormat;
  title: string;
  content: string | Buffer;
  metadata?: Record<string, any>;
  attachments?: OutputAttachment[];
}

export interface OutputAttachment {
  name: string;
  content: Buffer;
  mimeType: string;
  description?: string;
}

export interface OutputOptions {
  format?: OutputFormat;
  destination?: string;
  includeMetadata?: boolean;
  compress?: boolean;
  quality?: number;
  dimensions?: {
    width: number;
    height: number;
  };
}

export interface MultiModalResult {
  success: boolean;
  outputs: OutputContent[];
  errors: string[];
  metadata: {
    totalSize: number;
    processingTime: number;
    formats: OutputFormat[];
  };
}

export class MultiModalService {
  constructor() {}

  /**
   * Generates multiple output formats from content
   */
  async generateOutputs(
    content: string | object,
    options: OutputOptions = {}
  ): Promise<MultiModalResult> {
    const startTime = Date.now();
    const outputs: OutputContent[] = [];
    const errors: string[] = [];

    try {
      const formats = this.determineFormats(options.format);
      const parsedContent = typeof content === 'string' ? content : JSON.stringify(content, null, 2);

      for (const format of formats) {
        try {
          const output = await this.generateSingleOutput(parsedContent, format, options);
          outputs.push(output);
        } catch (error) {
          errors.push(`Failed to generate ${format} output: ${error}`);
        }
      }

      const totalSize = outputs.reduce((size, output) => {
        const contentSize = typeof output.content === 'string'
          ? Buffer.byteLength(output.content, 'utf8')
          : output.content.length;
        return size + contentSize;
      }, 0);

      return {
        success: errors.length === 0,
        outputs,
        errors,
        metadata: {
          totalSize,
          processingTime: Date.now() - startTime,
          formats
        }
      };
    } catch (error) {
      return {
        success: false,
        outputs: [],
        errors: [`Multi-modal generation failed: ${error}`],
        metadata: {
          totalSize: 0,
          processingTime: Date.now() - startTime,
          formats: []
        }
      };
    }
  }

  /**
   * Saves outputs to files
   */
  async saveOutputs(
    result: MultiModalResult,
    basePath: string = process.cwd()
  ): Promise<string[]> {
    const savedFiles: string[] = [];

    for (const output of result.outputs) {
      try {
        const filePath = await this.saveSingleOutput(output, basePath);
        savedFiles.push(filePath);
      } catch (error) {
        console.error(`Failed to save ${output.format} output:`, error);
      }
    }

    return savedFiles;
  }

  /**
   * Creates a comprehensive report with multiple formats
   */
  async createComprehensiveReport(
    data: {
      title: string;
      summary: string;
      details: any;
      metrics?: Record<string, number>;
      charts?: any[];
    },
    options: OutputOptions = {}
  ): Promise<MultiModalResult> {
    const reportContent = this.formatReportContent(data);
    return this.generateOutputs(reportContent, {
      ...options,
      format: options.format || OutputFormat.HTML
    });
  }

  /**
   * Generates visualization outputs
   */
  async createVisualization(
    data: any,
    visualizationType: 'chart' | 'graph' | 'diagram' | 'heatmap',
    options: OutputOptions = {}
  ): Promise<MultiModalResult> {
    const visualizationContent = this.formatVisualizationContent(data, visualizationType);
    return this.generateOutputs(visualizationContent, {
      ...options,
      format: OutputFormat.IMAGE
    });
  }

  /**
   * Creates documentation in multiple formats
   */
  async createDocumentation(
    docs: {
      title: string;
      sections: Array<{
        title: string;
        content: string;
        codeBlocks?: string[];
      }>;
      apiReference?: any;
      examples?: string[];
    },
    options: OutputOptions = {}
  ): Promise<MultiModalResult> {
    const docContent = this.formatDocumentationContent(docs);
    return this.generateOutputs(docContent, {
      ...options,
      format: options.format || OutputFormat.MARKDOWN
    });
  }

  private determineFormats(requestedFormat?: OutputFormat): OutputFormat[] {
    if (requestedFormat) {
      return [requestedFormat];
    }

    // Default formats for comprehensive output
    return [OutputFormat.JSON, OutputFormat.HTML, OutputFormat.MARKDOWN];
  }

  private async generateSingleOutput(
    content: string,
    format: OutputFormat,
    options: OutputOptions
  ): Promise<OutputContent> {
    switch (format) {
      case OutputFormat.TEXT:
        return this.generateTextOutput(content, options);

      case OutputFormat.JSON:
        return this.generateJsonOutput(content, options);

      case OutputFormat.HTML:
        return this.generateHtmlOutput(content, options);

      case OutputFormat.MARKDOWN:
        return this.generateMarkdownOutput(content, options);

      case OutputFormat.PDF:
        return await this.generatePdfOutput(content, options);

      case OutputFormat.IMAGE:
        return await this.generateImageOutput(content, options);

      default:
        throw new Error(`Unsupported output format: ${format}`);
    }
  }

  private generateTextOutput(content: string, options: OutputOptions): OutputContent {
    return {
      type: OutputType.REPORT,
      format: OutputFormat.TEXT,
      title: 'Text Report',
      content: content,
      metadata: options.includeMetadata ? { generatedAt: new Date().toISOString() } : undefined
    };
  }

  private generateJsonOutput(content: string, options: OutputOptions): OutputContent {
    let jsonContent: object;
    try {
      jsonContent = JSON.parse(content);
    } catch {
      jsonContent = { content };
    }

    return {
      type: OutputType.REPORT,
      format: OutputFormat.JSON,
      title: 'JSON Report',
      content: JSON.stringify(jsonContent, null, 2),
      metadata: options.includeMetadata ? {
        generatedAt: new Date().toISOString(),
        format: 'json',
        version: '1.0'
      } : undefined
    };
  }

  private generateHtmlOutput(content: string, options: OutputOptions): OutputContent {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .content { background: white; padding: 20px; border: 1px solid #ddd; border-radius: 8px; }
        pre { background: #f8f8f8; padding: 15px; border-radius: 4px; overflow-x: auto; }
        code { background: #f4f4f4; padding: 2px 4px; border-radius: 3px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Report</h1>
        ${options.includeMetadata ? `<p>Generated: ${new Date().toISOString()}</p>` : ''}
    </div>
    <div class="content">
        <pre>${this.escapeHtml(content)}</pre>
    </div>
</body>
</html>`;

    return {
      type: OutputType.REPORT,
      format: OutputFormat.HTML,
      title: 'HTML Report',
      content: html,
      metadata: options.includeMetadata ? {
        generatedAt: new Date().toISOString(),
        format: 'html',
        version: '1.0'
      } : undefined
    };
  }

  private generateMarkdownOutput(content: string, options: OutputOptions): OutputContent {
    const markdown = `# Report

${options.includeMetadata ? `*Generated: ${new Date().toISOString()}*\n` : ''}

\`\`\`
${content}
\`\`\`
`;

    return {
      type: OutputType.REPORT,
      format: OutputFormat.MARKDOWN,
      title: 'Markdown Report',
      content: markdown,
      metadata: options.includeMetadata ? {
        generatedAt: new Date().toISOString(),
        format: 'markdown',
        version: '1.0'
      } : undefined
    };
  }

  private async generatePdfOutput(content: string, options: OutputOptions): Promise<OutputContent> {
    // In a real implementation, this would use a PDF generation library like puppeteer
    // For now, we'll create a placeholder
    const pdfContent = Buffer.from(`PDF Content Placeholder\n\n${content}`);

    return {
      type: OutputType.DOCUMENTATION,
      format: OutputFormat.PDF,
      title: 'PDF Report',
      content: pdfContent,
      metadata: options.includeMetadata ? {
        generatedAt: new Date().toISOString(),
        format: 'pdf',
        version: '1.0'
      } : undefined
    };
  }

  private async generateImageOutput(content: string, options: OutputOptions): Promise<OutputContent> {
    // In a real implementation, this would use a charting library or image generation
    // For now, we'll create a placeholder
    const imageContent = Buffer.from(`Image Content Placeholder\n\n${content}`);

    return {
      type: OutputType.VISUALIZATION,
      format: OutputFormat.IMAGE,
      title: 'Visualization',
      content: imageContent,
      metadata: options.includeMetadata ? {
        generatedAt: new Date().toISOString(),
        format: 'png',
        dimensions: options.dimensions || { width: 800, height: 600 }
      } : undefined
    };
  }

  private async saveSingleOutput(output: OutputContent, basePath: string): Promise<string> {
    const extension = this.getFileExtension(output.format);
    const fileName = `${output.title.toLowerCase().replace(/\s+/g, '-')}.${extension}`;
    const filePath = path.join(basePath, fileName);

    const content = typeof output.content === 'string'
      ? Buffer.from(output.content, 'utf8')
      : output.content;

    await fs.writeFile(filePath, content);
    return filePath;
  }

  private formatReportContent(data: any): string {
    return `
Report: ${data.title}

Summary:
${data.summary}

Details:
${typeof data.details === 'object' ? JSON.stringify(data.details, null, 2) : data.details}

${data.metrics ? `Metrics:\n${Object.entries(data.metrics).map(([k, v]) => `${k}: ${v}`).join('\n')}` : ''}
`;
  }

  private formatVisualizationContent(data: any, type: string): string {
    return `Visualization (${type}):
${JSON.stringify(data, null, 2)}`;
  }

  private formatDocumentationContent(docs: any): string {
    let content = `# ${docs.title}\n\n`;

    for (const section of docs.sections) {
      content += `## ${section.title}\n\n${section.content}\n\n`;

      if (section.codeBlocks) {
        for (const code of section.codeBlocks) {
          content += `\`\`\`\n${code}\n\`\`\`\n\n`;
        }
      }
    }

    if (docs.apiReference) {
      content += `## API Reference\n\n\`\`\`json\n${JSON.stringify(docs.apiReference, null, 2)}\n\`\`\`\n\n`;
    }

    if (docs.examples) {
      content += `## Examples\n\n`;
      for (const example of docs.examples) {
        content += `\`\`\`\n${example}\n\`\`\`\n\n`;
      }
    }

    return content;
  }

  private getFileExtension(format: OutputFormat): string {
    const extensions: Record<OutputFormat, string> = {
      [OutputFormat.TEXT]: 'txt',
      [OutputFormat.JSON]: 'json',
      [OutputFormat.HTML]: 'html',
      [OutputFormat.MARKDOWN]: 'md',
      [OutputFormat.PDF]: 'pdf',
      [OutputFormat.IMAGE]: 'png',
      [OutputFormat.AUDIO]: 'mp3',
      [OutputFormat.VIDEO]: 'mp4'
    };

    return extensions[format] || 'txt';
  }

  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };

    return text.replace(/[&<>"']/g, (m) => map[m]);
  }
}
