const vscode = require('vscode');
const { chooseModel, generateCommitMessage, configureProvider } = require('./src/commands');

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('kodeCommit.chooseModel', () => chooseModel(context)),
    vscode.commands.registerCommand('kodeCommit.generateCommitMessage', () => generateCommitMessage(context)),
    vscode.commands.registerCommand('kodeCommit.configureProvider', () => configureProvider(context))
  );
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};
