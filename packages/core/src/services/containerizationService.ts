/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
import { ProjectType } from './contextAnalysisService.js';

export interface DockerGenerationOptions {
  projectType: ProjectType;
  nodeVersion?: string;
  pythonVersion?: string;
  ports?: number[];
  entryPoint?: string;
}

export class ContainerizationService {
  /**
   * Generates a Dockerfile for the project.
   */
  async generateDockerfile(projectPath: string, options: DockerGenerationOptions): Promise<string> {
    const dockerfilePath = path.join(projectPath, 'Dockerfile');
    let content = '';

    switch (options.projectType) {
      case ProjectType.NODEJS:
      case ProjectType.EXPRESS:
      case ProjectType.NESTJS:
        content = this.generateNodeDockerfile(options);
        break;
      case ProjectType.REACT:
      case ProjectType.VUE:
      case ProjectType.ANGULAR:
        content = this.generateFrontendDockerfile(options);
        break;
      // Add Python logic here if needed, inferred from previous tools
      default:
        // Default to a generic Node template if unknown, or return error
        content = this.generateNodeDockerfile(options);
    }

    await fs.writeFile(dockerfilePath, content, 'utf-8');
    return content;
  }

  /**
   * Generates a docker-compose.yml file.
   */
  async generateComposeFile(projectPath: string, services: Record<string, any>): Promise<string> {
    const composePath = path.join(projectPath, 'docker-compose.yml');
    
    // Simple YAML construction manually to avoid extra dependencies for now
    let content = `version: '3.8'\n\nservices:\n`;
    
    for (const [name, config] of Object.entries(services)) {
      content += `  ${name}:\n`;
      if (config.build) content += `    build: ${config.build}\n`;
      if (config.image) content += `    image: ${config.image}\n`;
      if (config.ports) {
        content += `    ports:\n`;
        config.ports.forEach((p: string) => content += `      - \"${p}\"\n`);
      }
      if (config.environment) {
        content += `    environment:\n`;
        config.environment.forEach((e: string) => content += `      - ${e}\n`);
      }
      content += '\n';
    }

    await fs.writeFile(composePath, content, 'utf-8');
    return content;
  }

  /**
   * Builds a Docker image.
   */
  async buildImage(projectPath: string, imageName: string): Promise<{ success: boolean; output: string }> {
    return new Promise((resolve) => {
      const child = spawn('docker', ['build', '-t', imageName, '.'], { cwd: projectPath });
      
      let output = '';
      child.stdout.on('data', (d) => output += d.toString());
      child.stderr.on('data', (d) => output += d.toString());
      
      child.on('close', (code) => {
        resolve({ success: code === 0, output });
      });
      
      child.on('error', (err) => {
        resolve({ success: false, output: err.message });
      });
    });
  }

  private generateNodeDockerfile(options: DockerGenerationOptions): string {
    const version = options.nodeVersion || '18';
    const port = options.ports?.[0] || 3000;
    const startCmd = options.entryPoint ? `CMD ["node", "${options.entryPoint}"]` : 'CMD ["npm", "start"]';

    return `# Base image
FROM node:${version}-alpine

# Working directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Expose port
EXPOSE ${port}

# Start command
${startCmd}
`;
  }

  private generateFrontendDockerfile(options: DockerGenerationOptions): string {
    const version = options.nodeVersion || '18';
    
    // Multi-stage build
    return `# Build stage
FROM node:${version}-alpine as build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
`;
  }
}
