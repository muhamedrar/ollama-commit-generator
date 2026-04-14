const vscode = require('vscode');
const { listOllamaModels, runOllamaModel } = require('./ollama');
const { findGitRepository, getDiffText } = require('./git');
const { buildCommitPrompt, normalizeCommitMessage, fillGitCommitInputBox, showCommitDocument } = require('./commit');

const MODEL_STATE_KEY = 'ollamaCommit.selectedModel';

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
    placeHolder: 'Select an Ollama model',
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

    const normalizedMessage = normalizeCommitMessage(commitMessage);
    if (!normalizedMessage) {
      vscode.window.showWarningMessage('Generated commit message could not be normalized.');
      return;
    }

    const inserted = await fillGitCommitInputBox(normalizedMessage);
    if (inserted) {
      vscode.window.showInformationMessage('Commit message inserted into the Source Control input box.');
      return;
    }

    await showCommitDocument(normalizedMessage);
  } catch (error) {
    vscode.window.showErrorMessage(`Ollama generation failed: ${error.message}`);
  }
}

module.exports = {
  chooseModel,
  generateCommitMessage
};
