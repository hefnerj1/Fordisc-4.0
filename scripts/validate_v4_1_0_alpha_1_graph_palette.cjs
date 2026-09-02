#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'frontend', 'src', 'App.tsx'), 'utf8');
const paletteMatch = app.match(/const GRAPH_PALETTE = \[([\s\S]*?)\n\];/);
if (!paletteMatch) throw new Error('Extended graph palette was not found.');

const colors = Array.from(paletteMatch[1].matchAll(/'(#(?:[0-9A-F]{6}))'/g), (match) => match[1]);
const apricot = ['#D72000', '#EE6100', '#FFAD0A', '#1BB6AF', '#9093A2', '#132157'];
if (colors.length !== 64) throw new Error(`Expected 64 graph colors; found ${colors.length}.`);
if (new Set(colors).size !== colors.length) throw new Error('The extended graph palette contains duplicate colors.');
if (JSON.stringify(colors.slice(0, apricot.length)) !== JSON.stringify(apricot)) {
  throw new Error('The graph palette does not begin with the approved LaCroixColoR::Apricot sequence.');
}

const builtInHowellsGroups = Array.from({ length: 58 }, (_, index) => `Howells ${index + 1}`);
const normalize = (label) => String(label ?? '').trim().toUpperCase();
const colorMap = new Map(builtInHowellsGroups.map((label, index) => [normalize(label), colors[index]]));
if (colorMap.size !== 58 || new Set(colorMap.values()).size !== 58) {
  throw new Error('A 58-group built-in analysis would reuse a color.');
}
if (JSON.stringify(Array.from(colorMap.values()).slice(0, 4)) !== JSON.stringify(apricot.slice(0, 4))) {
  throw new Error('Four-way analyses do not receive the first four Apricot colors.');
}

for (const removed of [
  'POSTCRANIAL_GRAPH_COLOR_OVERRIDES',
  'FDB_GRAPH_COLOR_OVERRIDES',
  'HOWELLS_GRAPH_COLOR_OVERRIDES',
  'GENERAL_GRAPH_COLOR_OVERRIDES'
]) {
  if (app.includes(removed)) throw new Error(`Legacy graph-color override remains: ${removed}`);
}

for (const required of [
  'function buildGraphColorMap(labels: string[]): GraphColorMap',
  'const graphColorMap = buildGraphColorMap(canonicalGroupLabels);',
  'function reportGraphColorMap(result: AnalyzeResponse): GraphColorMap',
  'const colorMap = reportGraphColorMap(result);',
  'buildReportDfaSvg(result, colorMap)',
  'buildReportTernarySvg(result, colorMap)',
  'buildReportDendrogramSvg(result, colorMap)',
  'buildReportCanonical3dSvg(result, colorMap)',
  'buildCanonicalEllipses(ellipseSourcePoints, scaleX, scaleY, module, colorMap)',
  'buildCanonicalEllipses(reportReferencePlotPoints, scaleX, scaleY, module, colorMap)'
]) {
  if (!app.includes(required)) throw new Error(`Missing graph-color integration: ${required}`);
}

const colorCallLines = app.split('\n').filter((line) => line.includes('graphColorFor(') && !line.includes('function graphColorFor('));
const unmappedCalls = colorCallLines.filter((line) => !/\b(?:colorMap|graphColorMap)\b/.test(line));
if (unmappedCalls.length) {
  throw new Error(`Graph rendering still bypasses the analysis color map:\n${unmappedCalls.join('\n')}`);
}

console.log('Apricot graph palette passed: 6 official colors + 58 custom slots, unique coverage for all 58 built-in Howells groups, and shared live/report mapping.');
