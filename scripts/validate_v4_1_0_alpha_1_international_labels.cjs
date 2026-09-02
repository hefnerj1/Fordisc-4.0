#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const ts = require(path.join(__dirname, '..', 'frontend', 'node_modules', 'typescript'));

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'frontend', 'src', 'groupLabels.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020
  }
}).outputText;
const loaded = { exports: {} };
new Function('require', 'module', 'exports', compiled)(require, loaded, loaded.exports);

const {
  INTERNATIONAL_GROUP_DISPLAY_LABELS,
  analyzeResponseForDisplay,
  internationalGroupTextForDisplay
} = loaded.exports;

const expected = {
  Af_AmF: 'Af Am Female', Af_AmM: 'Af Am Male',
  Eu_AmF: 'Euro Am Female', Eu_AmM: 'Euro Am Male',
  GERF: 'German Female', GERM: 'German Male',
  ItalF: 'Italian Female', ItalM: 'Italian Male',
  JF20: 'Japanese Female', JM20: 'Japanese Male',
  PorF: 'Portuguese Female', PorM: 'Portuguese Male',
  RWAF: 'Rwandan Female', RWAM: 'Rwandan Male',
  SAWBF: 'So Af Black Female', SAWBM: 'So Af Black Male',
  SACF: 'So Af Coloured Female', SACM: 'So Af Coloured Male',
  SAWF: 'So Af White Female', SAWM: 'So Af White Male',
  THF: 'Thai Female', THM: 'Thai Male'
};

if (JSON.stringify(INTERNATIONAL_GROUP_DISPLAY_LABELS) !== JSON.stringify(expected)) {
  throw new Error('International display mapping does not match the approved 22-group terminology.');
}

const raw = {
  ok: true,
  operation: 'international_crania_dfa',
  engine_version: 'test',
  wrapper_version: 'test',
  response_mode: 'extended',
  result: {
    case_id: 'case-Af_AmF-remains-unchanged',
    groups: ['Af_AmF', 'Eu_AmM'],
    classification: {
      predicted_group: 'Af_AmF',
      table: [{ Actual: 'Af_AmF', Af_AmF: 10, Eu_AmM: 2 }]
    },
    relationship: [{ group: 'Af_AmF' }, { group: 'Eu_AmM' }],
    measurement_checks: [{ group_means: { Af_AmF: 123, Eu_AmM: 124 } }],
    extended_results: {
      pairwise_mahalanobis: [{ group: 'Af_AmF', Af_AmF: 0, Eu_AmM: 3.5 }]
    }
  }
};

const display = analyzeResponseForDisplay(raw);
if (display === raw) throw new Error('International response was not copied for display.');
if (raw.result.classification.predicted_group !== 'Af_AmF') throw new Error('Raw analytical identifiers were mutated.');
if (display.result.classification.predicted_group !== 'Af Am Female') throw new Error('Predicted group was not translated.');
if (display.result.groups.join('|') !== 'Af Am Female|Euro Am Male') throw new Error('Selected groups were not translated.');
if (!Object.hasOwn(display.result.classification.table[0], 'Af Am Female')) throw new Error('Classification-matrix headers were not translated.');
if (!Object.hasOwn(display.result.measurement_checks[0].group_means, 'Euro Am Male')) throw new Error('Measurement-check headers were not translated.');
if (!Object.hasOwn(display.result.extended_results.pairwise_mahalanobis[0], 'Euro Am Male')) throw new Error('Extended-result headers were not translated.');
if (display.result.case_id !== 'case-Af_AmF-remains-unchanged') throw new Error('Non-group text was altered.');

const fdb = { ...raw, operation: 'cranial_dfa', result: { module: 'cranial_fdb_dfa', groups: ['BF'] } };
if (analyzeResponseForDisplay(fdb) !== fdb) throw new Error('Non-International response should remain untouched.');
if (internationalGroupTextForDisplay('<text>Af_AmF / Eu_AmM</text>') !== '<text>Af Am Female / Euro Am Male</text>') {
  throw new Error('Saved SVG/text translation failed.');
}

const appSource = fs.readFileSync(path.join(root, 'frontend', 'src', 'App.tsx'), 'utf8');
for (const required of [
  'const displayResult = useMemo(() => analyzeResponseForDisplay(result), [result]);',
  'const displayRunLogEntries = useMemo(() => runLogEntries.map(runLogEntryForDisplay), [runLogEntries]);',
  "const displayPractitionerGroupLabels = props.module === 'cranial_international_dfa';",
  '<span>{displayPractitionerGroupLabels ? group.label : group.id}</span>',
  'result={displayResult}',
  'runLogEntries={displayRunLogEntries}'
]) {
  if (!appSource.includes(required)) throw new Error(`Missing display integration: ${required}`);
}

const help = fs.readFileSync(path.join(root, 'docs', 'fd4_help_living_draft_v4_0_11.md'), 'utf8');
if (help.includes('International Crania (alpha)')) throw new Error('Help still labels International Crania as alpha.');
if (help.includes('the approved 2,353-record')) throw new Error('Help still contains the removed dataset phrase.');
if (!help.includes('**International Crania** - cranial discriminant-function analysis using the International reference dataset.')) {
  throw new Error('Revised International Help description is missing.');
}

const styles = fs.readFileSync(path.join(root, 'frontend', 'src', 'styles.css'), 'utf8');
const ternaryCenteringRule = styles.match(/\.graph-layout:not\(\.fullscreen-graph-layout\) \.fd4-ternary-plot\s*\{([^}]*)\}/);
if (!ternaryCenteringRule || !/display:\s*block;/.test(ternaryCenteringRule[1]) || !/margin-inline:\s*auto;/.test(ternaryCenteringRule[1])) {
  throw new Error('The live ternary plot is not centered within its graph panel.');
}
if (!/\.fd4-ternary-plot\s*\{\s*max-width:\s*820px;\s*\}/.test(styles)) {
  throw new Error('The centered ternary plot no longer retains its approved maximum width.');
}

console.log('International display labels, centered ternary plot, raw-code preservation, output translation, and Help copy contracts passed.');
