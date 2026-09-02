#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SUPPORT_EMAIL = 'fordisc.support@gmail.com';
const RETIRED_EMAILS = [
  ['hefnerj1', 'msu.edu'].join('@'),
  ['pbailey2', 'utk.edu'].join('@'),
];
const REQUIRED_FILES = [
  'Dockerfile.render',
  'docker-compose.yml',
  'render.yaml',
  'frontend/src/ClerkAuthShell.tsx',
  'docs/fd4_help_living_draft_v4_0_11.md',
  'docs/FD4_TERMS_AND_CONDITIONS_DRAFT_v4_0_9.md',
];
const TEXT_EXTENSIONS = new Set([
  '.cjs', '.css', '.html', '.js', '.json', '.md', '.py', '.sh', '.txt', '.ts', '.tsx', '.yaml', '.yml',
]);
const TEXT_FILENAMES = new Set(['Dockerfile', 'Dockerfile.render', 'README']);
const IGNORED_DIRECTORIES = new Set(['.git', 'dist', 'node_modules']);

function fail(message) {
  console.error(`FAIL  ${message}`);
  process.exitCode = 1;
}

function walk(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(entryPath));
    else if (entry.isFile()) files.push(entryPath);
  }
  return files;
}

for (const relativePath of REQUIRED_FILES) {
  const absolutePath = path.join(ROOT, relativePath);
  const source = fs.readFileSync(absolutePath, 'utf8');
  if (!source.includes(SUPPORT_EMAIL)) {
    fail(`${relativePath} does not contain the production support address.`);
  }
}

for (const absolutePath of walk(ROOT)) {
  const basename = path.basename(absolutePath);
  const extension = path.extname(absolutePath).toLowerCase();
  if (!TEXT_EXTENSIONS.has(extension) && !TEXT_FILENAMES.has(basename)) continue;
  const source = fs.readFileSync(absolutePath, 'utf8');
  for (const retiredEmail of RETIRED_EMAILS) {
    if (source.includes(retiredEmail)) {
      fail(`${path.relative(ROOT, absolutePath)} still contains retired support address ${retiredEmail}.`);
    }
  }
}

if (!process.exitCode) {
  console.log(`Support email passed: ${SUPPORT_EMAIL} is configured across runtime, deployment, Help, Terms, and source references.`);
}
