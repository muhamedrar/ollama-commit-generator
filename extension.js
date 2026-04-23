const vscode = require('vscode');
const { chooseModel, generateCommitMessage, configureProvider } = require('./src/commands');

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('ollamaCommit.chooseModel', () => chooseModel(context)),
    vscode.commands.registerCommand('ollamaCommit.generateCommitMessage', () => generateCommitMessage(context)),
    vscode.commands.registerCommand('ollamaCommit.configureProvider', () => configureProvider(context))
  );
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};
