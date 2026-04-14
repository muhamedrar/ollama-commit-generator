const { execFile } = require('child_process');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const vscode = require('vscode');

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
    const headers = { Accept: 'application/json' };

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
        response.on('data', chunk => (raw += chunk));
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

module.exports = {
  listOllamaModels,
  runOllamaModel
};
