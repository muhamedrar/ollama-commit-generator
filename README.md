# LlamaCommit

LlamaCommit is a VS Code extension that generates Git commit messages directly from the Source Control view. It started as an Ollama-based workflow and now supports multiple providers through one clean configuration flow.

## What it does

- Adds a `Generate Commit Message` action to the SCM title bar.
- Adds a gear button for provider setup without leaving Source Control.
- Supports local Ollama, one OpenAI-API-style provider with a configurable base URL, and Cohere.
- Stores provider API keys in VS Code Secret Storage.
- Remembers model selection separately for each provider.
- Falls back to opening a `git-commit` document if the SCM input box cannot be filled automatically.

## Supported providers

### 1. Ollama CLI

Use this when Ollama is installed locally and available on your machine.

- No API key required.
- Lists local Ollama models from the installed `ollama` executable.
- Optional custom executable path if `ollama` is not on `PATH`.

### 2. OpenAI API

Use this for any provider that supports the OpenAI API format.

- Base URL is configurable from the gear menu.
- Works with OpenAI when the base URL is `https://api.openai.com/v1`
- Works with Ollama when the base URL is `http://localhost:11434/v1`
- Optional API key for local Ollama, required when your endpoint needs authentication.
- Dynamic model listing from the configured endpoint.

### 3. Cohere

Use hosted Cohere chat models.

- Requires a Cohere API key.
- Default base URL: `https://api.cohere.com`
- Dynamic model listing for chat-capable Cohere models.

## Source Control actions

The extension adds two buttons to the Source Control title bar:

- `Generate Commit Message`: runs the active provider against the current Git diff.
- `AI Settings`: opens the persistent provider settings menu.

The settings menu now stays open until you explicitly close it or dismiss it with `Esc`, so you can change provider, API key, base URL, and model in one session.

## Settings menu actions

Depending on the active provider, the gear menu lets you:

- Switch the active provider
- Choose a model from the provider
- Enter a model manually
- Edit the commit instructions template
- Set or clear the provider API key
- Set the provider base URL
- Set the Ollama executable path
- Close the menu when you are done

## Prompt template customization

The commit-generation instructions are now stored in:

- [`templates/commit-template.txt`](templates/commit-template.txt)

This makes it easier to edit the prompt without touching the extension code.

The file uses two sections:

```text
[SYSTEM]
...
[/SYSTEM]

[USER]
...
{{diff}}
[/USER]
```

`{{diff}}` is replaced with the current Git diff before the request is sent to the selected provider.

If the template file is missing or malformed, the extension falls back to a built-in default template.

## Installation

### Install the extension

1. Clone or open this project in VS Code.
2. Package it as a VSIX if needed:
   ```bash
   npm run package-vsix
   ```
3. Install the VSIX in VS Code, or run the extension in Extension Development Host mode.

### Optional: run Ollama with Docker

1. Ensure Docker is installed.
2. Pull the image:
   ```bash
   docker pull ollama/ollama
   ```
3. Start the container:
   ```bash
   docker run -d -v ollama:/root/.ollama -p 11434:11434 --name ollama ollama/ollama
   ```
4. Pull a model inside the container:
   ```bash
   docker exec -it ollama ollama pull mistral
   ```
5. In LlamaCommit, choose `OpenAI API` and keep the base URL as `http://localhost:11434/v1`.

## Quick start

1. Open a Git repository in VS Code.
2. Open the Source Control view.
3. Click the gear button.
4. Select the provider you want to use.
5. Add the API key if that provider needs one.
6. Choose a model or enter one manually.
7. Close the settings menu.
8. Click `Generate Commit Message`.

## How commit generation works

1. The extension detects the current Git repository.
2. It reads the staged diff first.
3. If there is no staged diff, it reads the unstaged diff.
4. It builds the provider request from the prompt template.
5. It asks the active provider for a single-line commit message.
6. It normalizes the returned text.
7. It writes the message into the SCM commit input box when possible.
8. If that fails, it opens a `git-commit` document with the generated message.

## Requirements

- A Git repository must be open in the current workspace.
- For `Ollama CLI`, `ollama` must be installed locally, unless you set a custom executable path.
- For `OpenAI API`, the configured endpoint must expose OpenAI-compatible routes.
- For the official OpenAI service, use base URL `https://api.openai.com/v1` and provide a valid OpenAI API key.
- For `Cohere`, a valid Cohere API key is required.

## Architecture

The codebase is split so adding providers later stays straightforward:

- Provider registry in `src/providers`
- Provider state and secret helpers in `src/state.js`
- Command/UI flow in `src/commands.js`
- Prompt loading and commit normalization in `src/commit.js`
- Editable prompt template in `templates/commit-template.txt`

To add a new provider later, you mainly add a new provider module and register it in `src/providers/index.js`.

## Migration and compatibility

Older settings are still read as fallbacks for migration:

- `ollamaCommit.endpoint`
- `ollamaCommit.apiKey`
- `ollamaCommit.ollamaPath`

New API keys are stored in VS Code Secret Storage instead of plain settings.

## Troubleshooting

### No models are listed

- Confirm the provider is reachable.
- Confirm the API key is set when required.
- For Ollama CLI, confirm `ollama` runs in your terminal.
- Use manual model entry if the provider does not return a model list you want.

### The commit message is not inserted into SCM

The extension first tries to write into the built-in Git extension input box. If that is not available, it opens a `git-commit` document instead.

### The prompt needs tweaking

Edit `templates/commit-template.txt`, then rerun commit generation. The template is read from disk on each generation request.
