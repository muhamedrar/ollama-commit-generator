const vscode = require('vscode');
const { chooseModel, generateCommitMessage } = require('./src/commands');

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('ollamaCommit.chooseModel', () => chooseModel(context)),
    vscode.commands.registerCommand('ollamaCommit.generateCommitMessage', () => generateCommitMessage(context))
  );
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};
