const vscode = require('vscode');
const { execFile } = require('child_process');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const MODEL_STATE_KEY = 'ollamaCommit.selectedModel';
let cachedOllamaPath;

function execCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.toString() || error.message));
        return;
      }
      resolve(stdout.toString().trim());
    });
  });
}

function resolveExecutable(name) {
  const paths = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const dir of paths) {
    const candidate = path.join(dir, name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch (err) {
      continue;
    }
  }
  return null;
}

function getOllamaConfig() {
  const config = vscode.workspace.getConfiguration('ollamaCommit');
  return {
    endpoint: String(config.get('endpoint') || process.env.OLLAMA_ENDPOINT || '').trim(),
    apiKey: String(config.get('apiKey') || process.env.OLLAMA_API_KEY || '').trim(),
    path: String(config.get('ollamaPath') || '').trim()
  };
}

async function getOllamaExecutable(configPath) {
  if (cachedOllamaPath) {
    return cachedOllamaPath;
  }

  if (configPath) {
    try {
      fs.accessSync(configPath, fs.constants.X_OK);
      cachedOllamaPath = configPath;
      return configPath;
    } catch (err) {
      // Config path not executable, fall back to search
    }
  }

  // Try common paths
  const candidates = ['/bin/ollama', '/usr/bin/ollama', '/usr/local/bin/ollama'];
  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      cachedOllamaPath = candidate;
      return candidate;
    } catch (err) {
      continue;
    }
  }

  // Fall back to PATH resolution
  const resolved = resolveExecutable('ollama');
  if (resolved) {
    cachedOllamaPath = resolved;
    return resolved;
  }

  throw new Error('Ollama executable not found. Please install Ollama or set the ollamaPath setting.');
}

function requestJson(endpoint, method = 'GET', body = null, apiKey = '') {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint);
    const data = body ? JSON.stringify(body) : null;
    const client = url.protocol === 'https:' ? https : http;
    const headers = {
      'Accept': 'application/json'
    };

    if (data) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(data);
    }
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const request = client.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + (url.search || ''),
        method,
        headers,
        timeout: 120000
      },
      response => {
        let raw = '';
        response.setEncoding('utf8');
        response.on('data', chunk => raw += chunk);
        response.on('end', () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`Ollama endpoint returned ${response.statusCode}: ${raw}`));
            return;
          }
          try {
            resolve(JSON.parse(raw));
          } catch (err) {
            reject(new Error(`Invalid JSON from Ollama endpoint: ${err.message}`));
          }
        });
      }
    );

    request.on('error', reject);
    request.on('timeout', () => {
      request.destroy(new Error('Ollama endpoint request timed out.'));
    });

    if (data) {
      request.write(data);
    }
    request.end();
  });
}

function normalizeEndpoint(endpoint) {
  if (!endpoint) {
    return '';
  }
  return endpoint.replace(/\/$/, '');
}

async function listModelsFromEndpoint(endpoint, apiKey) {
  const normalized = normalizeEndpoint(endpoint);
  const modelsUrl = `${normalized}/v1/models`;
  const response = await requestJson(modelsUrl, 'GET', null, apiKey);

  if (Array.isArray(response.data)) {
    return response.data.map(item => String(item.id || item.model || item.name || item).trim()).filter(Boolean);
  }

  if (Array.isArray(response.models)) {
    return response.models.map(item => String(item.id || item.name || item).trim()).filter(Boolean);
  }

  if (Array.isArray(response)) {
    return response.map(item => String(item.id || item.model || item.name || item).trim()).filter(Boolean);
  }

  throw new Error('Unexpected model list format from Ollama endpoint.');
}

function parseCompletionResponse(response) {
  if (typeof response === 'string') {
    return response;
  }

  if (typeof response.completion === 'string') {
    return response.completion;
  }

  if (Array.isArray(response.output) && response.output.length) {
    return response.output.map(item => String(item)).join('');
  }

  if (typeof response.output === 'string') {
    return response.output;
  }

  if (Array.isArray(response.choices) && response.choices.length) {
    const choice = response.choices[0];
    if (typeof choice.text === 'string') {
      return choice.text;
    }
    if (choice.message && typeof choice.message.content === 'string') {
      return choice.message.content;
    }
    if (typeof choice.content === 'string') {
      return choice.content;
    }
  }

  if (response.result && typeof response.result === 'string') {
    return response.result;
  }

  return '';
}

async function runModelViaEndpoint(endpoint, apiKey, model, prompt) {
  const normalized = normalizeEndpoint(endpoint);
  const completionUrl = `${normalized}/v1/completions`;
  const result = await requestJson(completionUrl, 'POST', { model, prompt }, apiKey);
  const text = parseCompletionResponse(result);
  if (!text || !text.trim()) {
    throw new Error('Ollama endpoint returned no completion text.');
  }
  return text.trim();
}

async function listOllamaModels() {
  const config = getOllamaConfig();
  if (config.endpoint) {
    try {
      return await listModelsFromEndpoint(config.endpoint, config.apiKey);
    } catch (error) {
      throw new Error(`Unable to list Ollama models from endpoint. ${error.message}`);
    }
  }

  const ollama = await getOllamaExecutable(config.path);
  try {
    const stdout = await execCommand(ollama, ['list', '--json']);
    const models = JSON.parse(stdout);
    if (Array.isArray(models)) {
      return models.map(item => String(item.name || item.model || item).trim()).filter(Boolean);
    }
  } catch (jsonError) {
    try {
      const stdout = await execCommand(ollama, ['list']);
      return stdout
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line && !/^NAME|^---/.test(line))
        .map(line => line.split(/\s+/)[0]);
    } catch (plainError) {
      throw new Error('Unable to list Ollama models. Please ensure Ollama is installed and running.');
    }
  }
  throw new Error('No Ollama models were found.');
}

async function runOllamaModel(model, prompt) {
  const config = getOllamaConfig();
  if (config.endpoint) {
    try {
      return await runModelViaEndpoint(config.endpoint, config.apiKey, model, prompt);
    } catch (error) {
      throw new Error(`Unable to run Ollama model from endpoint. ${error.message}`);
    }
  }

  const ollama = await getOllamaExecutable(config.path);
  const candidateCommands = [
    ['run', model, '--prompt', prompt],
    ['complete', model, '--prompt', prompt],
    ['generate', model, '--prompt', prompt]
  ];

  let lastError;
  for (const args of candidateCommands) {
    try {
      return await execCommand(ollama, args, { maxBuffer: 20 * 1024 * 1024 });
    } catch (error) {
      lastError = error;
      const message = error.message || '';
      if (/unknown command|Unknown command|command not found/.test(message)) {
        continue;
      }
    }
  }

  throw new Error(lastError?.message || 'Failed to run Ollama model.');
}

async function findGitRepository(rootPath) {
  try {
    const stdout = await execCommand('git', ['rev-parse', '--show-toplevel'], { cwd: rootPath });
    return stdout.trim();
  } catch (error) {
    return null;
  }
}

async function getDiffText(repoPath) {
  try {
    const diff = await execCommand('git', ['diff', '--cached', '--no-color'], { cwd: repoPath, maxBuffer: 20 * 1024 * 1024 });
    if (diff && diff.trim()) {
      return diff;
    }
    return await execCommand('git', ['diff', '--no-color'], { cwd: repoPath, maxBuffer: 20 * 1024 * 1024 });
  } catch (error) {
    throw new Error('Unable to read Git diff. Make sure the workspace folder is a Git repository.');
  }
}

function buildCommitPrompt(diffText) {
  return `You are a Git commit message assistant. Read the diff and write a clear, specific commit message.
- Return only a title and, if needed, a short body separated by one blank line.
- Do not include the word "Commit:" or any labels.
- Use imperative present tense and keep the title under 72 characters.
- Avoid vague phrasing such as "update", "fix stuff", "add changes".
- Mention the key area changed and the main purpose of the change.

Diff:
${diffText}`;
}

async function fillGitCommitInputBox(commitMessage) {
  try {
    const gitExtension = vscode.extensions.getExtension('vscode.git');
    if (!gitExtension) {
      return false;
    }

    const gitApi = gitExtension.isActive
      ? gitExtension.exports
      : await gitExtension.activate();

    if (!gitApi || typeof gitApi.getAPI !== 'function') {
      return false;
    }

    const api = gitApi.getAPI(1);
    if (!api || !Array.isArray(api.repositories) || api.repositories.length === 0) {
      return false;
    }

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const repo = api.repositories.find(r => r.rootUri?.fsPath === workspaceRoot) || api.repositories[0];
    if (repo?.inputBox && typeof repo.inputBox.value === 'string') {
      repo.inputBox.value = commitMessage.trim();
      return true;
    }
  } catch (error) {
    // ignore failures, fallback to editor document
  }

  return false;
}

async function chooseModel(context) {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || !workspaceFolders.length) {
    vscode.window.showErrorMessage('Open a workspace folder before choosing an Ollama model.');
    return;
  }

  let models;
  try {
    models = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Initializing Ollama and loading models...',
        cancellable: false
      },
      async () => {
        return await listOllamaModels();
      }
    );
  } catch (error) {
    vscode.window.showErrorMessage(error.message);
    return;
  }

  if (!models.length) {
    vscode.window.showErrorMessage('No Ollama models found.');
    return;
  }

  const selected = await vscode.window.showQuickPick(models, {
    placeHolder: 'Select a local Ollama model',
    canPickMany: false
  });

  if (selected) {
    await context.globalState.update(MODEL_STATE_KEY, selected);
    vscode.window.showInformationMessage(`Selected Ollama model: ${selected}`);
  }
}

async function getSelectedModel(context) {
  let model = context.globalState.get(MODEL_STATE_KEY);
  if (typeof model === 'string' && model.trim()) {
    return model.trim();
  }

  const models = await listOllamaModels();
  if (!models.length) {
    throw new Error('No Ollama models available.');
  }

  return models[0];
}

async function generateCommitMessage(context) {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || !workspaceFolders.length) {
    vscode.window.showErrorMessage('Open a workspace folder before generating a commit message.');
    return;
  }

  const rootPath = workspaceFolders[0].uri.fsPath;
  const repoPath = await findGitRepository(rootPath);
  if (!repoPath) {
    vscode.window.showErrorMessage('Workspace is not inside a Git repository.');
    return;
  }

  let diffText;
  try {
    diffText = await getDiffText(repoPath);
  } catch (error) {
    vscode.window.showErrorMessage(error.message);
    return;
  }

  if (!diffText || !diffText.trim()) {
    vscode.window.showInformationMessage('No Git changes detected to generate a commit message from.');
    return;
  }

  let model;
  try {
    model = await getSelectedModel(context);
  } catch (error) {
    const choose = 'Choose model';
    const selection = await vscode.window.showErrorMessage(error.message, choose);
    if (selection === choose) {
      await chooseModel(context);
    }
    return;
  }

  const prompt = buildCommitPrompt(diffText);
  const progressOptions = {
    location: vscode.ProgressLocation.Notification,
    title: `Generating commit message with ${model}`,
    cancellable: false
  };

  try {
    const commitMessage = await vscode.window.withProgress(progressOptions, async () => {
      return await runOllamaModel(model, prompt);
    });

    if (!commitMessage || !commitMessage.trim()) {
      vscode.window.showWarningMessage('Ollama returned an empty response.');
      return;
    }

    const trimmedMessage = commitMessage.trim();
    const inserted = await fillGitCommitInputBox(trimmedMessage);
    if (inserted) {
      vscode.window.showInformationMessage('Commit message inserted into the Source Control input box.');
      return;
    }

    const doc = await vscode.workspace.openTextDocument({ content: trimmedMessage, language: 'git-commit' });
    await vscode.window.showTextDocument(doc, { preview: false });
  } catch (error) {
    vscode.window.showErrorMessage(`Ollama generation failed: ${error.message}`);
  }
}

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('ollamaCommit.chooseModel', () => chooseModel(context)),
    vscode.commands.registerCommand('ollamaCommit.generateCommitMessage', () => generateCommitMessage(context))
  );
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};
