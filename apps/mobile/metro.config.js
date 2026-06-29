// Metro config for the pnpm monorepo: watch the workspace root and resolve
// hoisted deps + the symlinked @safecity/* workspace packages.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
// Keep Metro's default hierarchical lookup ON so it can resolve pnpm's
// symlinked/nested deps (disabling it broke @expo/metro-runtime resolution).

module.exports = config;
