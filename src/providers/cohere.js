const { requestJson } = require('../http');

function joinUrl(baseUrl, path) {
  return `${String(baseUrl || '').replace(/\/+$/, '')}/${String(path || '').replace(/^\/+/, '')}`;
}

function extractCohereText(response) {
  if (Array.isArray(response.text)) {
    return response.text.join('');
  }

  if (typeof response.text === 'string') {
    return response.text;
  }

  const content = response.message && Array.isArray(response.message.content) ? response.message.content : [];
  return content
    .map(part => {
      if (typeof part === 'string') {
        return part;
      }

      if (part && typeof part.text === 'string') {
        return part.text;
      }

      return '';
    })
    .join('');
}

async function listModels(config) {
  if (!config.apiKey) {
    throw new Error('Add a Cohere API key first.');
  }

  const response = await requestJson(joinUrl(config.baseUrl, 'v1/models?endpoint=chat&page_size=1000'), {
    headers: {
      Authorization: `Bearer ${config.apiKey}`
    }
  });

  const models = Array.isArray(response.models) ? response.models : [];
  const names = models
    .map(model => String(model.name || model.id || '').trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));

  if (!names.length) {
    throw new Error('No Cohere chat models were returned.');
  }

  return names;
}

async function generateCommitMessage(config, prompt) {
  if (!config.apiKey) {
    throw new Error('Add a Cohere API key first.');
  }

  if (!config.model) {
    throw new Error('Choose a Cohere model first.');
  }

  const response = await requestJson(joinUrl(config.baseUrl, 'v2/chat'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'X-Client-Name': 'LlamaCommit'
    },
    body: {
      stream: false,
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

  const text = extractCohereText(response).trim();
  if (!text) {
    throw new Error('Cohere returned an empty response.');
  }

  return text;
}

module.exports = {
  id: 'cohere',
  label: 'Cohere',
  description: 'Use hosted Cohere chat models with a stored API key.',
  supportsModelListing: true,
  supportsManualModelEntry: true,
  supportsApiKey: true,
  supportsBaseUrl: true,
  supportsExecutablePath: false,
  requiresApiKey: true,
  listModels,
  generateCommitMessage
};
