const ollamaCliProvider = require('./ollamaCli');
const { createOpenAICompatibleProvider } = require('./openaiCompatible');
const cohereProvider = require('./cohere');

const providers = [
  ollamaCliProvider,
  createOpenAICompatibleProvider({
    id: 'openai-compatible',
    label: 'OpenAI API',
    description: 'Use any OpenAI-compatible endpoint by changing the base URL, including OpenAI and Ollama.',
    requiresApiKey: false
  }),
  cohereProvider
];

function getProviders() {
  return providers.slice();
}

function getProvider(providerId) {
  return providers.find(provider => provider.id === providerId);
}

module.exports = {
  getProvider,
  getProviders
};
