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
// pnpm symlinks: let Metro follow them, and don't walk up past each package.
config.resolver.unstable_enableSymlinks = true;
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
