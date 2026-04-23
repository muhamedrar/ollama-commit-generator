const vscode = require('vscode');

function buildCommitRequest(diffText) {
  const systemInstruction = [
    'You are a Git commit message generator.',
    'Return exactly one concise commit subject line.',
    'Do not include quotes, code fences, explanations, bullets, or extra lines.',
    'Use the format: type: short message.',
    'Choose the most accurate conventional type from the diff.'
  ].join(' ');

  const userPrompt = [
    'Write a commit message for this Git diff.',
    '',
    'Diff:',
    diffText
  ].join('\n');

  return {
    systemInstruction,
    userPrompt,
    combinedPrompt: `${systemInstruction}\n\n${userPrompt}`
  };
}

function normalizeCommitMessage(commitMessage) {
  if (!commitMessage || !commitMessage.trim()) {
    return '';
  }

  const normalized = commitMessage.replace(/\r\n/g, '\n').trim();
  const lines = normalized.split('\n').map(line => line.trimEnd());

  if (lines.length && /^(Title|Subject|Commit|Message)\s*[:\-]\s*/i.test(lines[0])) {
    lines[0] = lines[0].replace(/^(Title|Subject|Commit|Message)\s*[:\-]\s*/, '').trim();
  }

  while (lines.length && lines[0] === '') {
    lines.shift();
  }
  while (lines.length && lines[lines.length - 1] === '') {
    lines.pop();
  }

  const cleaned = [];
  let sawFirstBlank = false;
  for (const line of lines) {
    if (line === '') {
      if (cleaned.length && !sawFirstBlank) {
        cleaned.push('');
        sawFirstBlank = true;
      }
      continue;
    }
    cleaned.push(line);
  }

  return cleaned.join('\n').trim();
}

async function fillGitCommitInputBox(commitMessage) {
  try {
    const gitExtension = vscode.extensions.getExtension('vscode.git');
    if (!gitExtension) {
      return false;
    }

    const gitApi = gitExtension.isActive
      ? gitExtension.exports
      : await gitExtension.activate();

    if (!gitApi || typeof gitApi.getAPI !== 'function') {
      return false;
    }

    const api = gitApi.getAPI(1);
    if (!api || !Array.isArray(api.repositories) || api.repositories.length === 0) {
      return false;
    }

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const repo = api.repositories.find(r => r.rootUri?.fsPath === workspaceRoot) || api.repositories[0];
    if (repo?.inputBox && typeof repo.inputBox.value === 'string') {
      repo.inputBox.value = commitMessage.trim();
      return true;
    }
  } catch (error) {
    // ignore failures and fallback to editor document
  }

  return false;
}

async function showCommitDocument(commitMessage) {
  const normalizedMessage = commitMessage.trim();
  const existingEditor = vscode.window.visibleTextEditors.find(editor =>
    editor.document.languageId === 'git-commit' && editor.document.isUntitled
  );

  if (existingEditor) {
    const lastLineIndex = existingEditor.document.lineCount - 1;
    const fullRange = new vscode.Range(
      new vscode.Position(0, 0),
      existingEditor.document.lineAt(lastLineIndex).range.end
    );

    await existingEditor.edit(editBuilder => {
      editBuilder.replace(fullRange, normalizedMessage);
    });

    await vscode.window.showTextDocument(existingEditor.document, { preview: false, viewColumn: existingEditor.viewColumn });
    return;
  }

  const doc = await vscode.workspace.openTextDocument({ content: normalizedMessage, language: 'git-commit' });
  await vscode.window.showTextDocument(doc, { preview: false });
}

module.exports = {
  buildCommitRequest,
  normalizeCommitMessage,
  fillGitCommitInputBox,
  showCommitDocument
};
