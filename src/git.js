const { execFile } = require('child_process');

function execCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.toString() || error.message));
        return;
      }
      resolve(stdout.toString().trim());
    });
  });
}

async function findGitRepository(rootPath) {
  try {
    const stdout = await execCommand('git', ['rev-parse', '--show-toplevel'], { cwd: rootPath });
    return stdout.trim();
  } catch (error) {
    return null;
  }
}

async function getDiffText(repoPath) {
  try {
    const diff = await execCommand('git', ['diff', '--cached', '--no-color'], { cwd: repoPath, maxBuffer: 20 * 1024 * 1024 });
    if (diff && diff.trim()) {
      return diff;
    }
    return await execCommand('git', ['diff', '--no-color'], { cwd: repoPath, maxBuffer: 20 * 1024 * 1024 });
  } catch (error) {
    throw new Error('Unable to read Git diff. Make sure the workspace folder is a Git repository.');
  }
}

module.exports = {
  findGitRepository,
  getDiffText
};
