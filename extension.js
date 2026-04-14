const vscode = require('vscode');
const { execFile } = require('child_process');
const path = require('path');

const MODEL_STATE_KEY = 'ollamaCommit.selectedModel';

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

async function listOllamaModels() {
  try {
    const stdout = await execCommand('ollama', ['list', '--json']);
    const models = JSON.parse(stdout);
    if (Array.isArray(models)) {
      return models.map(item => String(item.name || item.model || item).trim()).filter(Boolean);
    }
  } catch (jsonError) {
    try {
      const stdout = await execCommand('ollama', ['list']);
      return stdout
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line && !/^NAME|^---/.test(line))
        .map(line => line.split(/\s+/)[0]);
    } catch (plainError) {
      throw new Error('Unable to list Ollama models. Please ensure Ollama is installed and on your PATH.');
    }
  }
  throw new Error('No Ollama models were found.');
}

async function runOllamaModel(model, prompt) {
  const candidateCommands = [
    ['run', model, '--prompt', prompt],
    ['complete', model, '--prompt', prompt],
    ['generate', model, '--prompt', prompt]
  ];

  let lastError;
  for (const args of candidateCommands) {
    try {
      return await execCommand('ollama', args, { maxBuffer: 20 * 1024 * 1024 });
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
  return `You are an assistant that writes a concise Git commit message from a diff. Only return a commit title and, if useful, a short body separated by a blank line. Use imperative present tense and keep it under 100 characters for the title.

Diff:
${diffText}`;
}

async function chooseModel(context) {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || !workspaceFolders.length) {
    vscode.window.showErrorMessage('Open a workspace folder before choosing an Ollama model.');
    return;
  }

  let models;
  try {
    models = await listOllamaModels();
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

    const doc = await vscode.workspace.openTextDocument({ content: commitMessage.trim(), language: 'git-commit' });
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
