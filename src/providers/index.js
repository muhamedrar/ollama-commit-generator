const ollamaCliProvider = require('./ollamaCli');
const { createOpenAICompatibleProvider } = require('./openaiCompatible');
const cohereProvider = require('./cohere');

const providers = [
  ollamaCliProvider,
  createOpenAICompatibleProvider({
    id: 'openai-compatible',
    label: 'Ollama / OpenAI-Compatible',
    description: 'Use any OpenAI-compatible endpoint, including Ollama running at /v1.',
    requiresApiKey: false
  }),
  createOpenAICompatibleProvider({
    id: 'openai',
    label: 'OpenAI',
    description: 'Use OpenAI chat models with a stored API key.',
    requiresApiKey: true
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
