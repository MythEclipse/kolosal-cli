/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ProjectType } from './contextAnalysisService.js';

export class DeploymentService {
  
  async generateGithubActions(projectPath: string, projectType: ProjectType): Promise<string> {
    const workflowsDir = path.join(projectPath, '.github', 'workflows');
    await fs.mkdir(workflowsDir, { recursive: true });
    const filePath = path.join(workflowsDir, 'ci.yml');

    let content = '';
    if (projectType === ProjectType.NODEJS || projectType === ProjectType.EXPRESS || projectType === ProjectType.NESTJS) {
      content = this.getNodeCI();
    } else {
      // Default fallback
      content = this.getNodeCI();
    }

    await fs.writeFile(filePath, content, 'utf-8');
    return content;
  }

  async generateVercelConfig(projectPath: string): Promise<string> {
    const filePath = path.join(projectPath, 'vercel.json');
    const content = `{
  "version": 2,
  "builds": [
    {
      "src": "package.json",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    { "src": "/(.*)", "dest": "/" }
  ]
}`;
    await fs.writeFile(filePath, content, 'utf-8');
    return content;
  }

  private getNodeCI(): string {
    return `name: Node.js CI

on:
  push:
    branches: [ "main" ]
  pull_request:
    branches: [ "main" ]

jobs:
  build:

    runs-on: ubuntu-latest

    strategy:
      matrix:
        node-version: [18.x, 20.x]

    steps:
    - uses: actions/checkout@v3
    - name: Use Node.js \${{ matrix.node-version }}
      uses: actions/setup-node@v3
      with:
        node-version: \${{ matrix.node-version }}
        cache: 'npm'
    - run: npm ci
    - run: npm run build --if-present
    - run: npm test
`;
  }
}
