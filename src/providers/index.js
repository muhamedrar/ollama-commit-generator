const { createOpenAICompatibleProvider } = require('./openaiCompatible');

const providers = [
  createOpenAICompatibleProvider({
    id: 'openai',
    label: 'OpenAI',
    description: 'Official OpenAI provider. The provider switcher remains ready for future providers.',
    defaultConfig: {
      baseUrl: 'https://api.openai.com/v1',
      model: ''
    },
    legacyConfigIds: ['openai-compatible'],
    legacySecretIds: ['openai-compatible'],
    apiKeyEnvironmentVariables: ['OPENAI_API_KEY'],
    requiresApiKey: true
  })
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
