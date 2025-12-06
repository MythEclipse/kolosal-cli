/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import fs from 'node:fs/promises'; // Use promises version for async/await
import type { Config } from '../config/config.js';
import type {
  ToolResult,
  ToolInvocation,
} from './tools.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
} from './tools.js';
import { ToolErrorType } from './tool-error.js';
import { getErrorMessage } from '../utils/errors.js';

/**
 * Parameters for the ScaffoldProject tool
 */
export interface ScaffoldProjectToolParams {
  /**
   * The absolute path to the project directory
   */
  project_path: string;

  /**
   * The project template to use (either a predefined one or a custom template name)
   */
  template: string;

  /**
   * Optional: Path to a directory containing a custom template. If provided, `template` refers to a subdirectory within this path.
   */
  customTemplatePath?: string;

  /**
   * Project name
   */
  project_name?: string;

  /**
   * Additional options for the template
   */
  options?: Record<string, unknown>;
}

/**
 * Predefined project templates
 */
interface ProjectTemplate {
  name: string;
  description: string;
  dependencies: string[];
  files: Record<string, string | { src: string; dest: string }>; // Allow for file paths in custom templates
}

const TEMPLATES: Record<string, ProjectTemplate> = {
  'node-js': {
    name: 'Node.js Application',
    description: 'Basic Node.js application with Express.js',
    dependencies: ['express', 'dotenv'],
    files: {
      'package.json': `{
  "name": "{{project_name}}",
  "version": "1.0.0",
  "description": "",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "nodemon index.js"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "dependencies": {
    "express": "^4.18.0",
    "dotenv": "^16.0.0"
  },
  "devDependencies": {
    "nodemon": "^2.0.0"
  }
}`,
      'index.js': `const express = require('express');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Basic route
app.get('/', (req, res) => {
  res.json({ message: 'Hello World!' });
});

// Start server
app.listen(PORT, () => {
  console.log(\`Server is running on port \${PORT}\`);
});

module.exports = app;`,
      '.env': `PORT=3000
NODE_ENV=development`,
      '.gitignore': `node_modules/
.env
*.log`,
    }
  },
  'react-ts': {
    name: 'React TypeScript Application',
    description: 'React application with TypeScript and Vite',
    dependencies: ['react', 'react-dom', '@types/react', '@types/react-dom'],
    files: {
      'package.json': `{
  "name": "{{project_name}}",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/react": "^18.0.27",
    "@types/react-dom": "^18.0.10",
    "@vitejs/plugin-react": "^3.1.0",
    "typescript": "^4.9.3",
    "vite": "^4.1.0"
  }
}`,
      'index.html': `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{{project_name}}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`,
      'vite.config.ts': `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
})`,
      'tsconfig.json': `{
  "compilerOptions": {
    "target": "ESNext",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ESNext"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": false,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}`,
      'tsconfig.node.json': `{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}`,
      'src/main.tsx': `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)`,
      'src/App.tsx': `import React from 'react'
import './App.css'

function App() {
  return (
    <div className="App">
      <h1>{{project_name}}</h1>
      <p>Edit <code>src/App.tsx</code> and save to test HMR</p>
    </div>
  )
}

export default App`,
      'src/App.css': `.App {
  text-align: center;
}

.App-logo {
  height: 40vmin;
  pointer-events: none;
}

@media (prefers-reduced-motion: no-preference) {
  .App-logo {
    animation: App-logo-spin infinite 20s linear;
  }
}

.App-header {
  background-color: #282c34;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: calc(10px + 2vmin);
  color: white;
}

.App-link {
  color: #61dafb;
}

@keyframes App-logo-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}`,
      'src/vite-env.d.ts': `/// <reference types="vite/client" />`,
    }
  },
  'python-flask': {
    name: 'Python Flask Application',
    description: 'Basic Python Flask web application',
    dependencies: ['flask'],
    files: {
      'requirements.txt': `flask==2.2.0
python-dotenv==0.21.0`,
      'app.py': `from flask import Flask
from dotenv import load_dotenv
import os

# Load environment variables
load_dotenv()

app = Flask(__name__)

@app.route('/')
def hello():
    return {'message': 'Hello World!'}

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)`,
      '.env': `PORT=5000
FLASK_ENV=development`,
      '.gitignore': `__pycache__/
*.py[cod]
*$py.class
*.so
.Python
env/
venv/
.venv/
pip-log.txt
pip-delete-this-directory.txt
.tox/
.coverage
.coverage.*
.cache
nosetests.xml
coverage.xml
*.cover
*.log
.gitignore
.DS_Store
.pytest_cache/`,
    }
  }
};

class ScaffoldProjectToolInvocation extends BaseToolInvocation<
  ScaffoldProjectToolParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: ScaffoldProjectToolParams,
  ) {
    super(params);
  }

  override getDescription(): string {
    const relativePath = path.relative(
      this.config.getTargetDir(),
      this.params.project_path,
    );
    return `Scaffolding ${this.params.template} project at ${relativePath}`;
  }

  async execute(_abortSignal: AbortSignal): Promise<ToolResult> {
    const { project_path, template, project_name, customTemplatePath } = this.params;
    
    let templateData: ProjectTemplate | undefined;

    if (customTemplatePath) {
      try {
        templateData = await this.loadCustomTemplate(customTemplatePath, template);
      } catch (error) {
        const errorMessage = `Error loading custom template from ${customTemplatePath}: ${getErrorMessage(error)}`;
        return {
          llmContent: errorMessage,
          returnDisplay: errorMessage,
          error: {
            message: errorMessage,
            type: ToolErrorType.PROJECT_SCAFFOLD_ERROR,
          },
        };
      }
    } else {
      templateData = TEMPLATES[template];
    }

    if (!templateData) {
      const availableTemplates = Object.keys(TEMPLATES).join(', ');
      const errorMessage = `Invalid template "${template}". Available predefined templates: ${availableTemplates}. Check customTemplatePath if using a custom template.`;
      return {
        llmContent: errorMessage,
        returnDisplay: errorMessage,
        error: {
          message: errorMessage,
          type: ToolErrorType.PROJECT_SCAFFOLD_ERROR,
        },
      };
    }

    try {
      // Create project directory
      await fs.mkdir(project_path, { recursive: true });

      // Create files from template
      const createdFiles: string[] = [];
      for (const [fileName, fileContent] of Object.entries(templateData.files)) {
        const filePath = path.join(project_path, fileName);
        const dirName = path.dirname(filePath);
        
        // Create directory if it doesn't exist
        await fs.mkdir(dirName, { recursive: true });
        
        // Replace placeholders in content
        let content = typeof fileContent === 'string' ? fileContent : await fs.readFile(path.join(customTemplatePath!, fileContent.src), 'utf-8');
        if (project_name) {
          content = content.replace(/\{\{project_name\}\}/g, project_name);
        }
        
        // Write file
        await fs.writeFile(filePath, content);
        createdFiles.push(fileName);
      }

      const successMessage = `Successfully scaffolded ${templateData.name || template} project at ${project_path}.
Created files: ${createdFiles.join(', ')}`;

      return {
        llmContent: successMessage,
        returnDisplay: successMessage,
      };
    } catch (error) {
      const errorMsg = `Error scaffolding project: ${getErrorMessage(error)}`;
      return {
        llmContent: errorMsg,
        returnDisplay: errorMsg,
        error: {
          message: errorMsg,
          type: ToolErrorType.PROJECT_SCAFFOLD_ERROR,
        },
      };
    }
  }

  private async loadCustomTemplate(basePath: string, templateName: string): Promise<ProjectTemplate> {
    const templateDir = path.join(basePath, templateName);
    const templateConfigPath = path.join(templateDir, 'template.json'); // Example config file
    
    try {
      const configContent = await fs.readFile(templateConfigPath, 'utf-8');
      const config = JSON.parse(configContent);

      const files: Record<string, string | { src: string; dest: string }> = {};

      // Recursively read all files in the template directory
      const readFilesRecursive = async (currentDir: string, relativePath: string = '') => {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          const entryPath = path.join(currentDir, entry.name);
          const entryRelativePath = path.join(relativePath, entry.name);
          if (entry.isDirectory()) {
            await readFilesRecursive(entryPath, entryRelativePath);
          } else if (entry.isFile() && entry.name !== 'template.json') {
            // Store path to file; content will be read during execution
            files[entryRelativePath] = { src: entryPath, dest: entryRelativePath };
          }
        }
      };

      await readFilesRecursive(templateDir);
      
      return {
        name: config.name || templateName,
        description: config.description || `Custom template: ${templateName}`,
        dependencies: config.dependencies || [],
        files: files as Record<string, string> // This cast is a simplification; in a full impl, we'd handle the different file content types.
      };
    } catch (error) {
      throw new Error(`Failed to load custom template from ${templateDir}: ${getErrorMessage(error)}`);
    }
  }
}

/**
 * Implementation of the ScaffoldProject tool logic
 */
export class ScaffoldProjectTool extends BaseDeclarativeTool<ScaffoldProjectToolParams, ToolResult> {
  static readonly Name: string = 'scaffold_project';

  constructor(private readonly config: Config) {
    super(
      ScaffoldProjectTool.Name,
      'ScaffoldProject',
      `Creates a new project from a predefined or custom template.
      
Predefined templates:
${Object.entries(TEMPLATES).map(([key, template]) => `- ${key}: ${template.description}`).join('\n')}

To use a custom template, provide 'customTemplatePath' and 'template' (which should be a subdirectory name within 'customTemplatePath').`,
      Kind.Create,
      {
        properties: {
          project_path: {
            description: "The absolute path to the project directory",
            type: 'string',
          },
          template: {
            description: `The project template to use. Can be a predefined template name or the name of a custom template subdirectory.`,
            type: 'string',
          },
          customTemplatePath: {
            description: `Optional: Absolute path to a directory containing custom templates. If provided, the 'template' parameter refers to a subdirectory within this path.`,
            type: 'string',
          },
          project_name: {
            description: 'Project name',
            type: 'string',
          },
          options: {
            description: 'Additional options for the template',
            type: 'object',
            additionalProperties: true,
          },
        },
        required: ['project_path', 'template'],
        type: 'object',
      },
    );
  }

  protected override validateToolParamValues(
    params: ScaffoldProjectToolParams,
  ): string | null {
    const projectPath = params.project_path;

    if (!projectPath) {
      return `Missing or empty "project_path"`;
    }

    if (!path.isAbsolute(projectPath)) {
      return `Project path must be absolute: ${projectPath}`;
    }

    const workspaceContext = this.config.getWorkspaceContext();
    if (!workspaceContext.isPathWithinWorkspace(projectPath)) {
      const directories = workspaceContext.getDirectories();
      return `Project path must be within one of the workspace directories: ${directories.join(
        ', ',
      )}`;
    }

    // Validate customTemplatePath if provided
    if (params.customTemplatePath && !path.isAbsolute(params.customTemplatePath)) {
      return `Custom template path must be absolute: ${params.customTemplatePath}`;
    }

    return null;
  }

  protected createInvocation(
    params: ScaffoldProjectToolParams,
  ): ToolInvocation<ScaffoldProjectToolParams, ToolResult> {
    return new ScaffoldProjectToolInvocation(this.config, params);
  }
}