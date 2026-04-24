# KodeCommit

KodeCommit is a VS Code extension that generates Git commit messages directly from the Source Control view. KODE stands for Keep Our Diffs Explained. The current build ships with OpenAI only, while keeping the provider-switching structure in place for future additions.

## What it does

- Adds a `Generate Commit Message` action to the SCM title bar.
- Adds a gear button for provider setup without leaving Source Control.
- Uses OpenAI for commit generation today.
- Stores API keys in VS Code Secret Storage.
- Remembers model selection between sessions.
- Falls back to opening a `git-commit` document if the SCM input box cannot be filled automatically.
- Keeps a provider switcher in the settings flow so more providers can be added later without changing the UX.

## Provider setup

KodeCommit currently exposes a single provider: OpenAI. The settings menu still includes a provider-switching step so the extension can grow into multiple providers later without changing the overall structure.

### OpenAI

- Base URL: `https://api.openai.com/v1`
- Requires an OpenAI API key.

## Source Control actions

The extension adds two buttons to the Source Control title bar:

- `Generate Commit Message`: runs the active provider against the current Git diff.
- `AI Settings`: opens the persistent provider settings menu.

The settings menu stays open until you explicitly close it or dismiss it with `Esc`, so you can change the provider, API key, base URL, and model in one session.

## Settings menu actions

The gear menu lets you:

- Choose a model from the provider
- Enter a model manually
- Switch the active provider
- Edit the commit instructions template
- Set or clear the API key
- Set the base URL
- Close the menu when you are done

## Prompt template customization

The commit-generation instructions are stored in:

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

`{{diff}}` is replaced with the current Git diff before the request is sent to the provider.

If the template file is missing or malformed, the extension falls back to a built-in default template.

## Installation

### Install the extension

1. Clone or open this project in VS Code.
2. Package it as a VSIX if needed:
```bash
   npm run package-vsix
```
3. Install the VSIX in VS Code, or run the extension in Extension Development Host mode.

## Quick start

1. Open a Git repository in VS Code.
2. Open the Source Control view.
3. Click the gear button.
4. Leave the provider on `OpenAI`.
5. Add your OpenAI API key.
6. Choose a model or enter one manually.
7. Close the settings menu.
8. Click `Generate Commit Message`.

## How commit generation works

1. The extension detects the current Git repository.
2. It reads the staged diff first.
3. If there is no staged diff, it reads the unstaged diff.
4. It builds the request from the prompt template.
5. It asks the provider for a single-line commit message.
6. It normalizes the returned text.
7. It writes the message into the SCM commit input box when possible.
8. If that fails, it opens a `git-commit` document with the generated message.

## Requirements

- A Git repository must be open in the current workspace.
- The configured endpoint should be the OpenAI API base URL.
- An OpenAI API key is required.

## Architecture

The codebase is structured to stay easy to maintain and extend:

- Provider logic in `src/providers`
- Provider state and secret helpers in `src/state.js`
- Command/UI flow in `src/commands.js`
- Prompt loading and commit normalization in `src/commit.js`
- Editable prompt template in `templates/commit-template.txt`

## Troubleshooting

### No models are listed

- Confirm the OpenAI endpoint is reachable.
- Confirm the API key is set.
- Use manual model entry if the provider does not return a model list.

### The commit message is not inserted into SCM

The extension first tries to write into the built-in Git extension input box. If that is not available, it opens a `git-commit` document instead.

### The prompt needs tweaking

Edit `templates/commit-template.txt`, then rerun commit generation. The template is read from disk on each generation request.
