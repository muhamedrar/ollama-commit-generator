const vscode = require('vscode');
const { getProvider, getProviders } = require('./providers');
const { findGitRepository, getDiffText } = require('./git');
const {
  buildCommitRequest,
  getCommitTemplatePath,
  normalizeCommitMessage,
  fillGitCommitInputBox,
  showCommitDocument
} = require('./commit');
const {
  deleteProviderSecret,
  getActiveProviderId,
  getResolvedProviderConfig,
  getStoredProviderConfig,
  hasProviderSecret,
  setActiveProviderId,
  storeProviderSecret,
  updateProviderConfig
} = require('./state');

function getProviderOrThrow(providerId) {
  const provider = getProvider(providerId);
  if (!provider) {
    throw new Error(`Unknown provider: ${providerId}`);
  }

  return provider;
}

function getProviderSummary(provider, config, status) {
  const details = [];

  if (config.model) {
    details.push(`model: ${config.model}`);
  }

  if (provider.supportsBaseUrl && config.baseUrl) {
    details.push(config.baseUrl);
  }

  if (provider.supportsExecutablePath && config.executablePath) {
    details.push(`path: ${config.executablePath}`);
  }

  if (provider.supportsApiKey) {
    details.push(status.hasApiKey ? 'API key available' : 'no API key');
  }

  return details.join(' | ') || provider.description;
}

async function promptForModelInput(context, providerId) {
  const provider = getProviderOrThrow(providerId);
  const config = getStoredProviderConfig(context, providerId);
  const value = await vscode.window.showInputBox({
    title: `${provider.label} model`,
    prompt: `Enter the model name for ${provider.label}.`,
    value: config.model || '',
    ignoreFocusOut: true
  });

  if (value === undefined) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    vscode.window.showWarningMessage('Model name was left empty.');
    return null;
  }

  await updateProviderConfig(context, providerId, { model: trimmed });
  return trimmed;
}

async function chooseModel(context, providerId = getActiveProviderId(context)) {
  const provider = getProviderOrThrow(providerId);
  const config = await getResolvedProviderConfig(context, providerId);

  let models;
  try {
    models = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Loading models from ${provider.label}...`,
        cancellable: false
      },
      async () => provider.listModels(config)
    );
  } catch (error) {
    const enterManually = 'Enter model manually';
    const selection = await vscode.window.showErrorMessage(error.message, enterManually);
    if (selection === enterManually) {
      return promptForModelInput(context, providerId);
    }
    return null;
  }

  const currentModel = config.model || '';
  const selection = await vscode.window.showQuickPick(
    [
      {
        label: 'Enter model manually',
        description: 'Type any model name yourself.',
        model: '__manual__'
      },
      ...models.map(model => ({
        label: model,
        description: model === currentModel ? 'Current model' : '',
        model
      }))
    ],
    {
      placeHolder: `Select a model for ${provider.label}`,
      canPickMany: false
    }
  );

  if (!selection) {
    return null;
  }

  if (selection.model === '__manual__') {
    return promptForModelInput(context, providerId);
  }

  await updateProviderConfig(context, providerId, { model: selection.model });
  vscode.window.showInformationMessage(`Selected model for ${provider.label}: ${selection.model}`);
  return selection.model;
}

async function switchProvider(context) {
  const activeProviderId = getActiveProviderId(context);
  const providers = getProviders();
  const onlyOneProvider = providers.length === 1;
  const items = await Promise.all(
    providers.map(async provider => {
      const config = await getResolvedProviderConfig(context, provider.id);
      const status = {
        hasApiKey: provider.supportsApiKey ? await hasProviderSecret(context, provider.id) : false
      };

      return {
        label: provider.label,
        description:
          provider.id === activeProviderId
            ? onlyOneProvider
              ? 'Active provider and the only available option right now'
              : 'Active provider'
            : provider.description,
        detail: getProviderSummary(provider, config, status),
        providerId: provider.id
      };
    })
  );

  const selection = await vscode.window.showQuickPick(items, {
    placeHolder: onlyOneProvider
      ? 'OpenAI is the only available provider right now. This menu stays ready for future providers.'
      : 'Choose the provider used to generate commit messages.'
  });

  if (!selection) {
    return null;
  }

  await setActiveProviderId(context, selection.providerId);
  const provider = getProviderOrThrow(selection.providerId);
  vscode.window.showInformationMessage(`Active provider set to ${provider.label}.`);
  return selection.providerId;
}

async function setApiKey(context, providerId) {
  const provider = getProviderOrThrow(providerId);
  const value = await vscode.window.showInputBox({
    title: `${provider.label} API key`,
    prompt: `Enter the API key for ${provider.label}. It will be stored in VS Code secret storage.`,
    password: true,
    ignoreFocusOut: true
  });

  if (value === undefined) {
    return false;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    vscode.window.showWarningMessage('API key was left empty.');
    return false;
  }

  await storeProviderSecret(context, providerId, trimmed);
  vscode.window.showInformationMessage(`Saved API key for ${provider.label}.`);
  return true;
}

async function clearApiKey(context, providerId) {
  const provider = getProviderOrThrow(providerId);
  await deleteProviderSecret(context, providerId);
  vscode.window.showInformationMessage(`Cleared the stored API key for ${provider.label}.`);
}

async function openCommitInstructionsEditor() {
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(getCommitTemplatePath()));
  await vscode.window.showTextDocument(document, { preview: false });
}

async function setBaseUrl(context, providerId) {
  const provider = getProviderOrThrow(providerId);
  const config = getStoredProviderConfig(context, providerId);
  const value = await vscode.window.showInputBox({
    title: `${provider.label} base URL`,
    prompt: `Enter the base URL for ${provider.label}.`,
    value: config.baseUrl || '',
    ignoreFocusOut: true
  });

  if (value === undefined) {
    return false;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    vscode.window.showWarningMessage('Base URL was left empty.');
    return false;
  }

  await updateProviderConfig(context, providerId, { baseUrl: trimmed });
  vscode.window.showInformationMessage(`Updated the base URL for ${provider.label}.`);
  return true;
}

async function setExecutablePath(context, providerId) {
  const provider = getProviderOrThrow(providerId);
  const config = getStoredProviderConfig(context, providerId);
  const value = await vscode.window.showInputBox({
    title: `${provider.label} executable path`,
    prompt: `Enter the absolute path to the ${provider.label} executable, or clear it to use PATH.`,
    value: config.executablePath || '',
    ignoreFocusOut: true
  });

  if (value === undefined) {
    return false;
  }

  await updateProviderConfig(context, providerId, { executablePath: value.trim() });
  vscode.window.showInformationMessage(`Updated the executable path for ${provider.label}.`);
  return true;
}

async function configureProvider(context) {
  while (true) {
    const activeProviderId = getActiveProviderId(context);
    const activeProvider = getProviderOrThrow(activeProviderId);
    const activeConfig = await getResolvedProviderConfig(context, activeProviderId);
    const activeHasApiKey = activeProvider.supportsApiKey ? await hasProviderSecret(context, activeProviderId) : false;

    const actions = [
      {
        label: 'Close settings',
        description: 'Dismiss the provider menu.',
        action: 'close'
      },
      {
        label: 'Switch active provider',
        description:
          getProviders().length === 1
            ? `${activeProvider.label} is the only available provider right now`
            : activeProvider.label,
        action: 'switch-provider'
      },
      {
        label: `Choose model for ${activeProvider.label}`,
        description: activeConfig.model || 'No model selected',
        action: 'choose-model'
      },
      {
        label: `Enter model manually for ${activeProvider.label}`,
        description: activeConfig.model || 'No model selected',
        action: 'manual-model'
      },
      {
        label: 'Edit commit instructions',
        description: 'Open the prompt template file for rewriting the commit rules.',
        action: 'edit-template'
      }
    ];

    if (activeProvider.supportsApiKey) {
      actions.push({
        label: `Set API key for ${activeProvider.label}`,
        description: activeHasApiKey ? 'API key currently available' : 'No API key available',
        action: 'set-api-key'
      });
      actions.push({
        label: `Clear stored API key for ${activeProvider.label}`,
        description: activeHasApiKey ? 'Remove the saved key from VS Code secret storage' : 'No stored key to clear',
        action: 'clear-api-key'
      });
    }

    if (activeProvider.supportsBaseUrl) {
      actions.push({
        label: `Set base URL for ${activeProvider.label}`,
        description: activeConfig.baseUrl || 'No base URL set',
        action: 'set-base-url'
      });
    }

    if (activeProvider.supportsExecutablePath) {
      actions.push({
        label: `Set executable path for ${activeProvider.label}`,
        description: activeConfig.executablePath || 'Using PATH lookup',
        action: 'set-executable-path'
      });
    }

    const selection = await vscode.window.showQuickPick(actions, {
      placeHolder: `Configure ${activeProvider.label}. Press Escape or choose Close settings when you are done.`
    });

    if (!selection || selection.action === 'close') {
      return;
    }

    switch (selection.action) {
      case 'switch-provider':
        await switchProvider(context);
        break;
      case 'choose-model':
        await chooseModel(context, activeProviderId);
        break;
      case 'manual-model':
        await promptForModelInput(context, activeProviderId);
        break;
      case 'edit-template':
        await openCommitInstructionsEditor();
        return;
      case 'set-api-key':
        await setApiKey(context, activeProviderId);
        break;
      case 'clear-api-key':
        await clearApiKey(context, activeProviderId);
        break;
      case 'set-base-url':
        await setBaseUrl(context, activeProviderId);
        break;
      case 'set-executable-path':
        await setExecutablePath(context, activeProviderId);
        break;
      default:
        return;
    }
  }
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

  const providerId = getActiveProviderId(context);
  const provider = getProviderOrThrow(providerId);
  let config = await getResolvedProviderConfig(context, providerId);

  if (provider.requiresApiKey && !config.apiKey) {
    const addApiKey = 'Add API key';
    const selection = await vscode.window.showErrorMessage(
      `${provider.label} needs an API key before it can generate commit messages.`,
      addApiKey
    );

    if (selection === addApiKey) {
      const saved = await setApiKey(context, providerId);
      if (!saved) {
        return;
      }
      config = await getResolvedProviderConfig(context, providerId);
    } else {
      return;
    }
  }

  if (!config.model) {
    const selectedModel = await chooseModel(context, providerId);
    if (!selectedModel) {
      return;
    }
    config = await getResolvedProviderConfig(context, providerId);
  }

  const prompt = buildCommitRequest(diffText);
  const progressOptions = {
    location: vscode.ProgressLocation.Notification,
    title: `Generating commit message with ${provider.label} (${config.model})`,
    cancellable: false
  };

  try {
    const commitMessage = await vscode.window.withProgress(progressOptions, async () => {
      return provider.generateCommitMessage(config, prompt);
    });

    if (!commitMessage || !commitMessage.trim()) {
      vscode.window.showWarningMessage(`${provider.label} returned an empty response.`);
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
    vscode.window.showErrorMessage(`${provider.label} generation failed: ${error.message}`);
  }
}

module.exports = {
  chooseModel,
  configureProvider,
  generateCommitMessage
};
