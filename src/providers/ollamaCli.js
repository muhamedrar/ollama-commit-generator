const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

function execCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.toString().trim() || error.message));
        return;
      }

      resolve(stdout.toString().trim());
    });
  });
}

function resolveExecutable(name) {
  const searchPaths = (process.env.PATH || '').split(path.delimiter).filter(Boolean);

  for (const directory of searchPaths) {
    const candidate = path.join(directory, name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch (error) {
      continue;
    }
  }

  return null;
}

async function getOllamaExecutable(config) {
  if (config.executablePath) {
    try {
      fs.accessSync(config.executablePath, fs.constants.X_OK);
      return config.executablePath;
    } catch (error) {
      throw new Error('The configured Ollama executable path is not executable.');
    }
  }

  const candidatePaths = ['/bin/ollama', '/usr/bin/ollama', '/usr/local/bin/ollama'];
  for (const candidate of candidatePaths) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch (error) {
      continue;
    }
  }

  const resolved = resolveExecutable('ollama');
  if (resolved) {
    return resolved;
  }

  throw new Error('Ollama executable not found. Install Ollama or set the executable path from the gear menu.');
}

async function listModels(config) {
  const executable = await getOllamaExecutable(config);

  try {
    const jsonOutput = await execCommand(executable, ['list', '--json']);
    const parsed = JSON.parse(jsonOutput);
    if (Array.isArray(parsed)) {
      return parsed
        .map(item => String(item.name || item.model || item).trim())
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right));
    }
  } catch (error) {
    // Fall through to plain-text parsing for older Ollama versions.
  }

  const plainOutput = await execCommand(executable, ['list']);
  return plainOutput
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !/^NAME|^---/.test(line))
    .map(line => line.split(/\s+/)[0])
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

async function generateCommitMessage(config, prompt) {
  if (!config.model) {
    throw new Error('Choose an Ollama model first.');
  }

  const executable = await getOllamaExecutable(config);
  const candidateCommands = [
    ['run', config.model, prompt.combinedPrompt],
    ['run', config.model, '--', prompt.combinedPrompt],
    ['run', config.model, '--prompt', prompt.combinedPrompt],
    ['generate', config.model, prompt.combinedPrompt]
  ];

  let lastError;

  for (const args of candidateCommands) {
    try {
      const output = await execCommand(executable, args, { maxBuffer: 20 * 1024 * 1024 });
      if (output && output.trim()) {
        return output.trim();
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(lastError ? lastError.message : 'Unable to run the selected Ollama model.');
}

module.exports = {
  id: 'ollama-cli',
  label: 'Ollama CLI',
  description: 'Use locally installed Ollama models through the ollama executable.',
  supportsModelListing: true,
  supportsManualModelEntry: true,
  supportsApiKey: false,
  supportsBaseUrl: false,
  supportsExecutablePath: true,
  listModels,
  generateCommitMessage
};
