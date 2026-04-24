const vscode = require('vscode');
const { getProvider, getProviders } = require('./providers');

const PROVIDER_STATE_KEY = 'kodeCommit.providerState';
const LEGACY_PROVIDER_STATE_KEY = 'ollamaCommit.providerState';
const MODEL_STATE_KEY = 'kodeCommit.selectedModel';
const LEGACY_MODEL_STATE_KEY = 'ollamaCommit.selectedModel';
const SETTINGS_NAMESPACE = 'kodeCommit';
const LEGACY_SETTINGS_NAMESPACE = 'ollamaCommit';

const PROVIDER_IDS = {
  OPENAI: 'openai'
};

const PROVIDER_ID_ALIASES = {
  'openai-compatible': PROVIDER_IDS.OPENAI
};

const REGISTERED_PROVIDERS = getProviders();
const FALLBACK_PROVIDER_ID = REGISTERED_PROVIDERS[0]?.id || PROVIDER_IDS.OPENAI;

function cloneConfig(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function createDefaultState() {
  return {
    activeProviderId: FALLBACK_PROVIDER_ID,
    providers: Object.fromEntries(
      REGISTERED_PROVIDERS.map(provider => [provider.id, cloneConfig(provider.defaultConfig)])
    )
  };
}

const DEFAULT_STATE = createDefaultState();

function cloneDefaultState() {
  return createDefaultState();
}

function getSecretStorageKey(providerId, namespace = SETTINGS_NAMESPACE) {
  return `${namespace}.secret.${providerId}.apiKey`;
}

function getLegacySettings() {
  const configuration = vscode.workspace.getConfiguration(SETTINGS_NAMESPACE);
  const legacyConfiguration = vscode.workspace.getConfiguration(LEGACY_SETTINGS_NAMESPACE);
  return {
    apiKey: String(configuration.get('apiKey') || legacyConfiguration.get('apiKey') || '').trim()
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

function normalizeProviderId(providerId) {
  const normalizedProviderId = PROVIDER_ID_ALIASES[String(providerId || '').trim()] || String(providerId || '').trim();
  return getProvider(normalizedProviderId)?.id || FALLBACK_PROVIDER_ID;
}

function getProviderConfigIds(provider) {
  return [provider.id, ...(provider.legacyConfigIds || [])];
}

function getProviderSecretIds(provider) {
  return [provider.id, ...(provider.legacySecretIds || [])];
}

function buildProviderConfig(provider, storedProviders, legacyModel) {
  const mergedConfig = cloneConfig(provider.defaultConfig);

  for (const configId of getProviderConfigIds(provider)) {
    Object.assign(mergedConfig, storedProviders[configId] || {});
  }

  if (provider.id === PROVIDER_IDS.OPENAI) {
    mergedConfig.baseUrl = normalizeBaseUrl(mergedConfig.baseUrl, {
      ensureV1: true,
      fallback: provider.defaultConfig?.baseUrl || ''
    });
    mergedConfig.model = String(mergedConfig.model || legacyModel || '').trim();
  }

  return mergedConfig;
}

function getProviderState(context) {
  const storedState =
    context.globalState.get(PROVIDER_STATE_KEY) ||
    context.globalState.get(LEGACY_PROVIDER_STATE_KEY) ||
    {};
  const mergedState = cloneDefaultState();
  const legacyModel = String(
    context.globalState.get(MODEL_STATE_KEY) || context.globalState.get(LEGACY_MODEL_STATE_KEY) || ''
  ).trim();
  const storedProviders = storedState.providers || {};

  mergedState.activeProviderId = normalizeProviderId(
    storedState.activeProviderId || mergedState.activeProviderId
  );
  mergedState.providers = Object.fromEntries(
    REGISTERED_PROVIDERS.map(provider => [provider.id, buildProviderConfig(provider, storedProviders, legacyModel)])
  );

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
  nextState.activeProviderId = normalizeProviderId(providerId);
  await saveProviderState(context, nextState);
}

function getStoredProviderConfig(context, providerId) {
  const state = getProviderState(context);
  const normalizedProviderId = normalizeProviderId(providerId);
  return {
    ...(state.providers[normalizedProviderId] || {})
  };
}

async function updateProviderConfig(context, providerId, updates) {
  const nextState = getProviderState(context);
  const normalizedProviderId = normalizeProviderId(providerId);
  nextState.providers[normalizedProviderId] = {
    ...(nextState.providers[normalizedProviderId] || {}),
    ...updates
  };
  await saveProviderState(context, nextState);
}

async function getProviderSecret(context, providerId) {
  const provider = getProvider(normalizeProviderId(providerId));
  if (!provider) {
    return '';
  }

  for (const secretId of getProviderSecretIds(provider)) {
    const storedSecret = await context.secrets.get(getSecretStorageKey(secretId));
    if (storedSecret && storedSecret.trim()) {
      return storedSecret.trim();
    }

    const legacyStoredSecret = await context.secrets.get(getSecretStorageKey(secretId, LEGACY_SETTINGS_NAMESPACE));
    if (legacyStoredSecret && legacyStoredSecret.trim()) {
      return legacyStoredSecret.trim();
    }
  }

  for (const envVarName of provider.apiKeyEnvironmentVariables || []) {
    const environmentSecret = String(process.env[envVarName] || '').trim();
    if (environmentSecret) {
      return environmentSecret;
    }
  }

  if (provider.id === PROVIDER_IDS.OPENAI) {
    return getLegacySettings().apiKey;
  }

  return '';
}

async function storeProviderSecret(context, providerId, value) {
  const normalizedProviderId = normalizeProviderId(providerId);
  await context.secrets.store(getSecretStorageKey(normalizedProviderId), value.trim());
}

async function deleteProviderSecret(context, providerId) {
  const provider = getProvider(normalizeProviderId(providerId));
  if (!provider) {
    return;
  }

  for (const secretId of new Set(getProviderSecretIds(provider))) {
    await context.secrets.delete(getSecretStorageKey(secretId));
    await context.secrets.delete(getSecretStorageKey(secretId, LEGACY_SETTINGS_NAMESPACE));
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
