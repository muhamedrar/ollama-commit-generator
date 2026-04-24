const { requestJson } = require('../http');

function joinUrl(baseUrl, path) {
  return `${String(baseUrl || '').replace(/\/+$/, '')}/${String(path || '').replace(/^\/+/, '')}`;
}

function parseModelList(response) {
  if (Array.isArray(response.data)) {
    return response.data;
  }

  if (Array.isArray(response.models)) {
    return response.models;
  }

  if (Array.isArray(response)) {
    return response;
  }

  return [];
}

function extractTextPart(contentPart) {
  if (typeof contentPart === 'string') {
    return contentPart;
  }

  if (contentPart && typeof contentPart.text === 'string') {
    return contentPart.text;
  }

  if (contentPart && contentPart.type === 'text' && typeof contentPart.content === 'string') {
    return contentPart.content;
  }

  return '';
}

function extractChatCompletionText(response) {
  const choice = Array.isArray(response.choices) ? response.choices[0] : null;
  if (!choice) {
    return '';
  }

  if (typeof choice.text === 'string') {
    return choice.text;
  }

  const message = choice.message || {};
  if (typeof message.content === 'string') {
    return message.content;
  }

  if (Array.isArray(message.content)) {
    return message.content.map(extractTextPart).join('');
  }

  return '';
}

function createOpenAICompatibleProvider(definition) {
  return {
    id: definition.id,
    label: definition.label,
    description: definition.description,
    defaultConfig: { ...(definition.defaultConfig || {}) },
    legacyConfigIds: Array.isArray(definition.legacyConfigIds) ? definition.legacyConfigIds.slice() : [],
    legacySecretIds: Array.isArray(definition.legacySecretIds) ? definition.legacySecretIds.slice() : [],
    apiKeyEnvironmentVariables: Array.isArray(definition.apiKeyEnvironmentVariables)
      ? definition.apiKeyEnvironmentVariables.slice()
      : [],
    supportsModelListing: true,
    supportsManualModelEntry: true,
    supportsApiKey: true,
    supportsBaseUrl: definition.supportsBaseUrl !== false,
    supportsExecutablePath: false,
    requiresApiKey: Boolean(definition.requiresApiKey),
    async listModels(config) {
      if (definition.requiresApiKey && !config.apiKey) {
        throw new Error(`Add an API key for ${definition.label} first.`);
      }

      const response = await requestJson(joinUrl(config.baseUrl, 'models'), {
        headers: {
          ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {})
        }
      });

      const models = parseModelList(response)
        .map(item => String(item.id || item.name || item.model || item).trim())
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right));

      if (!models.length) {
        throw new Error(`No models were returned by ${definition.label}.`);
      }

      return models;
    },
    async generateCommitMessage(config, prompt) {
      if (!config.model) {
        throw new Error(`Choose a model for ${definition.label} first.`);
      }

      if (definition.requiresApiKey && !config.apiKey) {
        throw new Error(`Add an API key for ${definition.label} first.`);
      }

      const response = await requestJson(joinUrl(config.baseUrl, 'chat/completions'), {
        method: 'POST',
        headers: {
          ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {})
        },
        body: {
          model: config.model,
          messages: [
            {
              role: 'system',
              content: prompt.systemInstruction
            },
            {
              role: 'user',
              content: prompt.userPrompt
            }
          ]
        }
      });

      const text = extractChatCompletionText(response).trim();
      if (!text) {
        throw new Error(`${definition.label} returned an empty response.`);
      }

      return text;
    }
  };
}

module.exports = {
  createOpenAICompatibleProvider
};
