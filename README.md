# LlamaCommit

A VS Code extension that adds Source Control actions for generating commit messages with:

- Local Ollama through the CLI
- Ollama or any other OpenAI-compatible `/v1` endpoint
- OpenAI models
- Cohere models

## Installation

### Ollama via Docker (optional)

1. Ensure Docker is installed on your system. If not, download and install Docker from [docker.com](https://www.docker.com/).

2. Pull the Ollama Docker image:
   ```bash
   docker pull ollama/ollama
   ```

3. Run the Ollama container:
   ```bash
   docker run -d -v ollama:/root/.ollama -p 11434:11434 --name ollama ollama/ollama
   ```

4. Pull the Mistral model inside the container:
   ```bash
   docker exec -it ollama ollama pull mistral
   ```

### Configuring the Extension

1. Open a Git workspace in VS Code.
2. Open the Source Control view.
3. Click the gear button in the SCM title bar.
4. Choose the active provider.
5. Add the provider API key if needed.
6. Choose a model from the provider, or type one manually.

For Ollama running with OpenAI compatibility, use the `Ollama / OpenAI-Compatible` provider and point it at `http://localhost:11434/v1`.

## Features

- Source Control generate button for commit messages.
- Gear button for provider switching and provider-specific setup.
- Secure secret storage for OpenAI and Cohere API keys.
- Dynamic model selection per provider.
- Clean provider architecture so new providers can be added with minimal changes.

## Usage

1. Open a Git workspace.
2. Click the `Generate Commit Message` button in the Source Control title bar.
3. If needed, use the gear button to configure the active provider, key, base URL, or model.

## Requirements

- For `Ollama CLI`, `ollama` must be installed and available on your PATH, or you must set its executable path from the gear menu.
- For `Ollama / OpenAI-Compatible`, point the base URL to a compatible `/v1` endpoint such as `http://localhost:11434/v1`.
- For `OpenAI`, set an OpenAI API key.
- For `Cohere`, set a Cohere API key.
- The workspace must be inside a Git repository.

## Notes

- Existing legacy settings such as `ollamaCommit.endpoint`, `ollamaCommit.apiKey`, and `ollamaCommit.ollamaPath` are still read as fallbacks for migration.
- Provider API keys are stored in VS Code Secret Storage instead of plain settings.
