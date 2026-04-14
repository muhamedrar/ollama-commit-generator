# Ollama Commit Generator

An example VS Code extension that adds a Source Control title action for generating commit messages with local Ollama models.

## Features

- Adds a button in the SCM title bar for generating commit messages.
- Adds a second title action to choose the local Ollama model.
- Uses local `ollama` CLI to list models and generate text.

## Usage

1. Open a Git workspace.
2. Click the `Generate Commit Message` button in the Source Control title bar.
3. If needed, use `Choose Ollama Model` first to pick a model.

## Requirements

- `ollama` must be installed and available on your PATH.
- The workspace must be inside a Git repository.
