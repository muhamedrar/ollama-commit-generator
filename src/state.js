const vscode = require('vscode');

const PROVIDER_STATE_KEY = 'ollamaCommit.providerState';
const LEGACY_MODEL_STATE_KEY = 'ollamaCommit.selectedModel';

const PROVIDER_IDS = {
  OLLAMA_CLI: 'ollama-cli',
  OPENAI_COMPATIBLE: 'openai-compatible',
  COHERE: 'cohere'
};

const DEFAULT_STATE = {
  activeProviderId: PROVIDER_IDS.OLLAMA_CLI,
  providers: {
    [PROVIDER_IDS.OLLAMA_CLI]: {
      executablePath: '',
      model: ''
    },
    [PROVIDER_IDS.OPENAI_COMPATIBLE]: {
      baseUrl: 'http://localhost:11434/v1',
      model: ''
    },
    [PROVIDER_IDS.COHERE]: {
      baseUrl: 'https://api.cohere.com',
      model: ''
    }
  }
};

function cloneDefaultState() {
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

function getSecretStorageKey(providerId) {
  return `ollamaCommit.secret.${providerId}.apiKey`;
}

function getLegacySettings() {
  const configuration = vscode.workspace.getConfiguration('ollamaCommit');
  return {
    ollamaPath: String(configuration.get('ollamaPath') || '').trim(),
    endpoint: String(configuration.get('endpoint') || '').trim(),
    apiKey: String(configuration.get('apiKey') || process.env.OLLAMA_API_KEY || '').trim()
  };
}

function normalizeBaseUrl(baseUrl, { ensureV1 = false, fallback = '' } = {}) {
  let normalized = String(baseUrl || '').trim() || fallback;
  normalized = normalized.replace(/\/+$/, '');

  if (ensureV1 && normalized && !/\/v1$/i.test(normalized)) {
    normalized = `${normalized}/v1`;
  }

  return normalized;
}

function getProviderState(context) {
  const storedState = context.globalState.get(PROVIDER_STATE_KEY) || {};
  const mergedState = cloneDefaultState();
  const legacySettings = getLegacySettings();
  const legacyModel = String(context.globalState.get(LEGACY_MODEL_STATE_KEY) || '').trim();
  const storedProviders = storedState.providers || {};
  const legacyOpenAiCompatibleConfig = storedProviders[PROVIDER_IDS.OPENAI_COMPATIBLE] || {};
  const legacyOpenAiConfig = storedProviders.openai || {};
  const preferLegacyOpenAi = storedState.activeProviderId === 'openai';

  mergedState.activeProviderId =
    storedState.activeProviderId === 'openai' ? PROVIDER_IDS.OPENAI_COMPATIBLE : storedState.activeProviderId || mergedState.activeProviderId;
  mergedState.providers = {
    ...mergedState.providers,
    ...storedProviders
  };

  mergedState.providers[PROVIDER_IDS.OLLAMA_CLI] = {
    ...DEFAULT_STATE.providers[PROVIDER_IDS.OLLAMA_CLI],
    ...storedProviders[PROVIDER_IDS.OLLAMA_CLI],
    executablePath:
      String(
        (storedProviders[PROVIDER_IDS.OLLAMA_CLI] || {}).executablePath ||
          legacySettings.ollamaPath ||
          ''
      ).trim(),
    model:
      String(
        (storedProviders[PROVIDER_IDS.OLLAMA_CLI] || {}).model ||
          legacyModel ||
          ''
      ).trim()
  };

  mergedState.providers[PROVIDER_IDS.OPENAI_COMPATIBLE] = {
    ...DEFAULT_STATE.providers[PROVIDER_IDS.OPENAI_COMPATIBLE],
    ...legacyOpenAiCompatibleConfig,
    baseUrl: normalizeBaseUrl(
      legacyOpenAiCompatibleConfig.baseUrl ||
        (preferLegacyOpenAi ? legacyOpenAiConfig.baseUrl : '') ||
        legacySettings.endpoint ||
        legacyOpenAiConfig.baseUrl,
      {
        ensureV1: true,
        fallback: DEFAULT_STATE.providers[PROVIDER_IDS.OPENAI_COMPATIBLE].baseUrl
      }
    ),
    model: String(
      legacyOpenAiCompatibleConfig.model || (preferLegacyOpenAi ? legacyOpenAiConfig.model : '') || legacyOpenAiConfig.model || ''
    ).trim()
  };

  mergedState.providers[PROVIDER_IDS.COHERE] = {
    ...DEFAULT_STATE.providers[PROVIDER_IDS.COHERE],
    ...storedProviders[PROVIDER_IDS.COHERE],
    baseUrl: normalizeBaseUrl(
      (storedProviders[PROVIDER_IDS.COHERE] || {}).baseUrl,
      {
        fallback: DEFAULT_STATE.providers[PROVIDER_IDS.COHERE].baseUrl
      }
    ),
    model: String((storedProviders[PROVIDER_IDS.COHERE] || {}).model || '').trim()
  };

  return mergedState;
}

async function saveProviderState(context, nextState) {
  await context.globalState.update(PROVIDER_STATE_KEY, nextState);
}

function getActiveProviderId(context) {
  return getProviderState(context).activeProviderId;
}

async function setActiveProviderId(context, providerId) {
  const nextState = getProviderState(context);
  nextState.activeProviderId = providerId;
  await saveProviderState(context, nextState);
}

function getStoredProviderConfig(context, providerId) {
  const state = getProviderState(context);
  return {
    ...(state.providers[providerId] || {})
  };
}

async function updateProviderConfig(context, providerId, updates) {
  const nextState = getProviderState(context);
  nextState.providers[providerId] = {
    ...(nextState.providers[providerId] || {}),
    ...updates
  };
  await saveProviderState(context, nextState);
}

async function getProviderSecret(context, providerId) {
  const storedSecret = await context.secrets.get(getSecretStorageKey(providerId));
  if (storedSecret && storedSecret.trim()) {
    return storedSecret.trim();
  }

  if (providerId === PROVIDER_IDS.OPENAI_COMPATIBLE) {
    const legacyOpenAiSecret = await context.secrets.get(getSecretStorageKey('openai'));
    if (legacyOpenAiSecret && legacyOpenAiSecret.trim()) {
      return legacyOpenAiSecret.trim();
    }

    return String(process.env.OPENAI_API_KEY || getLegacySettings().apiKey || '').trim();
  }

  if (providerId === PROVIDER_IDS.COHERE) {
    return String(process.env.COHERE_API_KEY || '').trim();
  }

  return '';
}

async function storeProviderSecret(context, providerId, value) {
  await context.secrets.store(getSecretStorageKey(providerId), value.trim());
}

async function deleteProviderSecret(context, providerId) {
  await context.secrets.delete(getSecretStorageKey(providerId));

  if (providerId === PROVIDER_IDS.OPENAI_COMPATIBLE) {
    await context.secrets.delete(getSecretStorageKey('openai'));
  }
}

async function hasProviderSecret(context, providerId) {
  return Boolean(await getProviderSecret(context, providerId));
}

async function getResolvedProviderConfig(context, providerId) {
  const storedConfig = getStoredProviderConfig(context, providerId);
  const apiKey = await getProviderSecret(context, providerId);

  return {
    ...storedConfig,
    apiKey
  };
}

module.exports = {
  PROVIDER_IDS,
  DEFAULT_STATE,
  deleteProviderSecret,
  getActiveProviderId,
  getProviderSecret,
  getProviderState,
  getResolvedProviderConfig,
  getStoredProviderConfig,
  hasProviderSecret,
  normalizeBaseUrl,
  setActiveProviderId,
  storeProviderSecret,
  updateProviderConfig
};
