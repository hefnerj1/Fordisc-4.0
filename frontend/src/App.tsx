import { useEffect, useMemo, useRef, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { analyze, analyzeCustomReference, analyzeModuleTestCase, analyzePostcranialDfa, analyzeStature, apiGet } from './api';
import { fixtures } from './fixtures';
import type { AnalysisOptions, AnalyzeResponse, ModuleId, ModuleMetadata, VariableMetadata, Workflow } from './types';
import { applyLanguageToDocument, localizeHtmlDocument, persistInterfaceLanguage, readStoredInterfaceLanguage, translateKey, translateText } from './i18n';
import type { InterfaceLanguage } from './i18n';
import { useFd4Access } from './access';
import ReferenceGroupWorldMap from './ReferenceGroupWorldMap';
import { collectLatestCaseReportAnalyses } from './caseReport';
import type { CaseReportAnalysis, CaseReportDisplaySettings, CaseReportGraphSnapshot } from './caseReport';
import { analyzeResponseForDisplay, internationalGroupTextForDisplay } from './groupLabels';

const DEFAULT_MODULE: ModuleId = 'cranial_fdb_dfa';
type SortGroupsMode = 'distance' | 'group_name';
type TransformationMode = 'none' | 'log' | 'shape';
type StepwiseMode = 'none' | 'forward_wilks' | 'forward_mean' | 'forward_min' | 'forward_kappa';
type StepwiseWeighting = 'unweighted' | 'weighted';

function stepwiseDefaultThreshold(mode: StepwiseMode) {
  if (mode === 'forward_wilks') return '0.002';
  if (mode === 'forward_kappa') return '0.001';
  return '0.005';
}
type ClassificationMatrixMode = 'counts' | 'percentages';
type ClassificationRateMode = 'loocv' | 'resubstitution';
type StatureReference = '19th_c_cstats' | 'trotter_mstats' | '20th_c_fstats';
type StatureGroupMode = 'any' | 'classified' | 'manual';
type StatureSortBy = 'prediction_interval' | 'r_square';
type StatureUnits = 'in' | 'cm';

const DEMO_CASE_ID_BY_MODULE: Record<ModuleId, string> = {
  cranial_fdb_dfa: 'FDB Demo',
  cranial_howells_dfa: 'Howells Demo',
  cranial_international_dfa: 'International Example',
  postcranial_stature: 'Postcranial Demo'
};
type ActiveAnalysisTask = 'module_test' | 'dfa' | 'stature' | null;
type StandaloneStatureSelection = { ready: boolean; group: string | null; note: string; label: string };
const INCH_TO_CM = 2.54;
type TypicalityDisplaySettings = { f: boolean; chi: boolean; ranked: boolean };
const DEFAULT_TYPICALITY_DISPLAY: TypicalityDisplaySettings = { f: true, chi: true, ranked: true };
const WIDE_TABLE_GROUP_THRESHOLD = 12;
const SCREEN_ORDER = [
  'measurement_entry',
  'results',
  'extended_results',
  'graph',
  'notes_run_log',
  'export_report',
  'analysis_options',
  'help',
  'reference_group_world_map'
];

const SCREEN_TITLES: Record<string, string> = {
  start_case_setup: 'Start / Case Setup',
  measurement_entry: 'Measurement Entry',
  reference_group_world_map: 'Howells Reference Group Map',
  results: 'Results',
  extended_results: 'Extended Results',
  graph: 'Graphs',
  notes_run_log: 'Notes / Run Log',
  export_report: 'Export / Report',
  analysis_options: 'Analysis Options',
  import_data: 'Import Data',
  help: 'Help'
};

const SCREEN_TRANSLATION_KEYS: Record<string, string> = {
  start_case_setup: 'nav.start_case_setup',
  measurement_entry: 'nav.measurement_entry',
  reference_group_world_map: 'nav.reference_group_world_map',
  results: 'nav.results',
  extended_results: 'nav.extended_results',
  graph: 'nav.graphs',
  notes_run_log: 'nav.notes_run_log',
  export_report: 'nav.export_report',
  analysis_options: 'nav.analysis_options',
  import_data: 'nav.import_data',
  help: 'nav.help'
};

function screenTitle(screenId: string) {
  return SCREEN_TITLES[screenId] ?? humanize(screenId);
}

function localizedScreenTitle(screenId: string, language: InterfaceLanguage) {
  const key = SCREEN_TRANSLATION_KEYS[screenId];
  return key ? translateKey(key, language) : screenTitle(screenId);
}

const CRANIAL_FDB_CALCULATED = new Set(['NAA', 'PRA', 'BAA', 'NBA', 'BBA', 'BRA']);
const CRANIAL_HOWELLS_CALCULATED = new Set([
  'NAA', 'PRA', 'BAA', 'NBA', 'BBA', 'BRA', 'SSA', 'NFA', 'DKA', 'NDA', 'SIA', 'FRA', 'PAA', 'OCA', 'RFA', 'RPA', 'ROA', 'BSA', 'SBA', 'SLA', 'TBA'
]);

const STATURE_REFERENCE_OPTIONS: Array<{ value: StatureReference; label: string; description: string }> = [
  { value: '19th_c_cstats', label: '19th C CStats', description: 'Terry 19th-century measured statures.' },
  { value: 'trotter_mstats', label: 'Trotter MStats', description: 'Trotter / military measured statures.' },
  { value: '20th_c_fstats', label: '20th C FStats', description: 'FDB 20th-century forensic statures.' }
];

const STATURE_GROUP_OPTIONS = ['Any', 'BF', 'BM', 'WF', 'WM', 'HM'];
const STATURE_VARIABLE_ORDER = ['CALCXL', 'CLAXLN', 'FEMBLN', 'FEMXLN', 'FIBXLN', 'HUMXLN', 'INNOHT', 'RADXLN', 'SACAHT', 'SCAPHT', 'TIBXLN', 'ULNXLN', 'ULNPHL'];
const DEFAULT_STATURE_SETTINGS = {
  level: '0.90',
  maxTerms: '3',
  displayRows: '25',
  birthyearMin: '1930',
  birthyearMax: '',
  includeBirthyearMissing: true,
  reference: '20th_c_fstats' as StatureReference,
  groupMode: 'any' as StatureGroupMode,
  manualGroup: 'Any',
  sortBy: 'prediction_interval' as StatureSortBy,
  units: 'in' as StatureUnits
};


type ClientValidationItem = {
  variable: string;
  severity: 'warning' | 'error';
  message: string;
  type?: string;
};

type ClientValidation = {
  warnings: ClientValidationItem[];
  errors: ClientValidationItem[];
  byVariable: Record<string, ClientValidationItem[]>;
};

type HelpDocument = {
  title: string;
  version: string;
  source: string;
  markdown: string;
};

type ImportPreview = {
  fileName: string;
  fileType: string;
  delimiter: string;
  headers: string[];
  rows: Array<Record<string, string>>;
  idColumn: string | null;
  groupColumn: string | null;
  groupMode: string | null;
  matchedMeasurementColumns: Array<{ header: string; variable: string }>;
  ignoredColumns: string[];
  warnings: string[];
  unsupported?: boolean;
};

type LegacyFd3CasePreview = {
  fileName: string;
  fileType: string;
  caseId: string;
  suggestedModule: ModuleId;
  measurements: Record<string, string>;
  selectedVariables: string[];
  selectedGroups: string[];
  rawSelectedGroups: string[];
  groupAliases: Array<{ raw: string; mapped: string }>;
  ignoredFields: string[];
  warnings: string[];
  rowCount: number;
  comments: string;
  commentsAvailable: boolean;
  commentsRestored: boolean;
  commentsSource: string;
};

type PendingLegacyCaseSelection = { module: ModuleId; groups: string[] };

type OutputSectionSettings = {
  summaryTables: boolean;
  covarianceTables: boolean;
  canonicalDetails: boolean;
  classificationStats: boolean;
  mahalanobisMatrices: boolean;
  referenceClassifications: boolean;
  nearestNeighbors: boolean;
  allStatureEquations: boolean;
};

type RunLogDisplaySettings = {
  sortGroupsMode: SortGroupsMode;
  classificationMatrixMode: ClassificationMatrixMode;
  typicalityDisplay: TypicalityDisplaySettings;
  statureUnits: StatureUnits;
};

type LegacyRunLogSummary = {
  stepwise: string;
  variables: string;
  groups: string;
  classification: string;
  dSquared: string;
  posterior: string;
  typicalityF: string;
  accuracy: string;
};

type RunLogEntry = {
  id: string;
  timestamp: string;
  module: string;
  caseId: string;
  resultSnapshot?: AnalyzeResponse;
  displaySettings?: RunLogDisplaySettings;
  graphSnapshots?: CaseReportGraphSnapshot[];
  legacySummary?: LegacyRunLogSummary;
};

type CaseModuleState = {
  selected_variables: string[];
  selected_groups: string[];
  classify_case?: boolean;
  classification_rate_estimation?: ClassificationRateMode;
};

function runLogEntryForDisplay(entry: RunLogEntry): RunLogEntry {
  const international = entry.module === 'cranial_international_dfa'
    || entry.resultSnapshot?.operation === 'international_crania_dfa';
  if (!international) return entry;
  const legacySummary = entry.legacySummary ? {
    ...entry.legacySummary,
    groups: internationalGroupTextForDisplay(entry.legacySummary.groups),
    classification: internationalGroupTextForDisplay(entry.legacySummary.classification)
  } : undefined;
  return {
    ...entry,
    resultSnapshot: analyzeResponseForDisplay(entry.resultSnapshot ?? null) ?? undefined,
    graphSnapshots: entry.graphSnapshots?.map((snapshot) => ({
      ...snapshot,
      title: internationalGroupTextForDisplay(snapshot.title),
      content: internationalGroupTextForDisplay(snapshot.content)
    })),
    legacySummary
  };
}

const CASE_MODULE_IDS: ModuleId[] = ['cranial_fdb_dfa', 'cranial_howells_dfa', 'cranial_international_dfa', 'postcranial_stature'];


const DEFAULT_OUTPUT_SECTIONS: OutputSectionSettings = {
  summaryTables: true,
  covarianceTables: true,
  canonicalDetails: true,
  classificationStats: true,
  mahalanobisMatrices: true,
  referenceClassifications: true,
  nearestNeighbors: true,
  allStatureEquations: true
};

export default function App() {
  const authorization = useFd4Access();
  const capabilities = authorization.capabilities;
  const isFreeTier = authorization.access_tier === 'free';
  const isStudentTier = authorization.access_tier === 'student';
  const isFullTier = authorization.access_tier === 'full';
  const [selectedModule, setSelectedModule] = useState<ModuleId>(DEFAULT_MODULE);
  const [activeScreen, setActiveScreen] = useState<string>(() => (
    authorization.access_tier === 'free'
      ? 'results'
      : authorization.access_tier === 'student'
        ? 'measurement_entry'
        : 'start_case_setup'
  ));
  const [modules, setModules] = useState<ModuleMetadata[]>([]);
  const [variables, setVariables] = useState<VariableMetadata[]>([]);
  const [analysisOptions, setAnalysisOptions] = useState<AnalysisOptions | null>(null);
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [caseValues, setCaseValues] = useState<Record<string, string>>({});
  const [includedVariables, setIncludedVariables] = useState<Set<string>>(new Set());
  const [variableSelectionStatus, setVariableSelectionStatus] = useState('');
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [apiError, setApiError] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeAnalysisTask, setActiveAnalysisTask] = useState<ActiveAnalysisTask>(null);
  const [lastPostcranialClassifiedGroup, setLastPostcranialClassifiedGroup] = useState<string | null>(null);
  const [lastPostcranialDfaSignature, setLastPostcranialDfaSignature] = useState<string | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(true);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [caseId, setCaseId] = useState('');
  const [reportAnalystName, setReportAnalystName] = useState('');
  const [interfaceLanguage, setInterfaceLanguage] = useState<InterfaceLanguage>(readStoredInterfaceLanguage);
  const [caseNotes, setCaseNotes] = useState('');
  const [runLogEntries, setRunLogEntries] = useState<RunLogEntry[]>([]);
  const [caseModuleStates, setCaseModuleStates] = useState<Partial<Record<ModuleId, CaseModuleState>>>({});
  const caseModuleStatesRef = useRef<Partial<Record<ModuleId, CaseModuleState>>>({});
  const [checkMeasurementErrors, setCheckMeasurementErrors] = useState(true);
  const [outlierDetectionThreshold, setOutlierDetectionThreshold] = useState('0.005');
  const [nearestNeighborCount, setNearestNeighborCount] = useState('15');
  const [excludeIdsText, setExcludeIdsText] = useState('');
  const [outputSections, setOutputSections] = useState<OutputSectionSettings>(DEFAULT_OUTPUT_SECTIONS);
  const [statureLevel, setStatureLevel] = useState(DEFAULT_STATURE_SETTINGS.level);
  const [statureMaxTerms, setStatureMaxTerms] = useState(DEFAULT_STATURE_SETTINGS.maxTerms);
  const [statureDisplayRows, setStatureDisplayRows] = useState(DEFAULT_STATURE_SETTINGS.displayRows);
  const [statureBirthyearMin, setStatureBirthyearMin] = useState(DEFAULT_STATURE_SETTINGS.birthyearMin);
  const [statureBirthyearMax, setStatureBirthyearMax] = useState(DEFAULT_STATURE_SETTINGS.birthyearMax);
  const [statureIncludeBirthyearMissing, setStatureIncludeBirthyearMissing] = useState(DEFAULT_STATURE_SETTINGS.includeBirthyearMissing);
  const [statureReference, setStatureReference] = useState<StatureReference>(DEFAULT_STATURE_SETTINGS.reference);
  const [statureGroupMode, setStatureGroupMode] = useState<StatureGroupMode>(DEFAULT_STATURE_SETTINGS.groupMode);
  const [statureManualGroup, setStatureManualGroup] = useState(DEFAULT_STATURE_SETTINGS.manualGroup);
  const [statureSortBy, setStatureSortBy] = useState<StatureSortBy>(DEFAULT_STATURE_SETTINGS.sortBy);
  const [statureUnits, setStatureUnits] = useState<StatureUnits>(DEFAULT_STATURE_SETTINGS.units);
  const [sortGroupsMode, setSortGroupsMode] = useState<SortGroupsMode>('distance');
  const [transformationMode, setTransformationMode] = useState<TransformationMode>('none');
  const [stepwiseMode, setStepwiseMode] = useState<StepwiseMode>('none');
  const [stepwiseMinVariables, setStepwiseMinVariables] = useState('1');
  const [stepwiseMaxVariables, setStepwiseMaxVariables] = useState('20');
  const [stepwiseThreshold, setStepwiseThreshold] = useState('0.005');
  const [stepwiseTurbo, setStepwiseTurbo] = useState(true);
  const [stepwiseWeighting, setStepwiseWeighting] = useState<StepwiseWeighting>('unweighted');
  const [classifyOnlyIfTypF, setClassifyOnlyIfTypF] = useState(true);
  const [classifyOnlyIfTypFThreshold, setClassifyOnlyIfTypFThreshold] = useState('0.01');
  const [classifyCase, setClassifyCase] = useState(true);
  const [classificationRateMode, setClassificationRateMode] = useState<ClassificationRateMode>('loocv');
  const [classificationMatrixMode, setClassificationMatrixMode] = useState<ClassificationMatrixMode>('counts');
  const [typicalityDisplay, setTypicalityDisplay] = useState<TypicalityDisplaySettings>(DEFAULT_TYPICALITY_DISPLAY);
  const [lastRunSignature, setLastRunSignature] = useState<string | null>(null);
  const [importDataEnabled, setImportDataEnabled] = useState(false);
  const caseFileInputRef = useRef<HTMLInputElement | null>(null);
  const fd3CaseFileInputRef = useRef<HTMLInputElement | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [useCustomReferenceAnalysis, setUseCustomReferenceAnalysis] = useState(false);
  const [helpDocument, setHelpDocument] = useState<HelpDocument | null>(null);
  const [helpLoading, setHelpLoading] = useState(false);
  const [helpError, setHelpError] = useState('');
  const [legacyCasePreview, setLegacyCasePreview] = useState<LegacyFd3CasePreview | null>(null);
  const [legacyCaseStatus, setLegacyCaseStatus] = useState('');
  const [pendingLegacyCaseSelection, setPendingLegacyCaseSelection] = useState<PendingLegacyCaseSelection | null>(null);
  const mainWorkspaceRef = useRef<HTMLElement | null>(null);
  const activeScreenHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const previousActiveScreenRef = useRef(activeScreen);
  const announcementCounterRef = useRef(0);
  const [accessibilityAnnouncement, setAccessibilityAnnouncement] = useState<{ id: number; text: string; urgent: boolean } | null>(null);
  const displayResult = useMemo(() => analyzeResponseForDisplay(result), [result]);
  const displayRunLogEntries = useMemo(() => runLogEntries.map(runLogEntryForDisplay), [runLogEntries]);

  function announceAccessibility(text: string, urgent = false) {
    announcementCounterRef.current += 1;
    setAccessibilityAnnouncement({ id: announcementCounterRef.current, text, urgent });
  }

  function focusActiveScreenSoon() {
    window.setTimeout(() => {
      window.requestAnimationFrame(() => {
        const target = activeScreenHeadingRef.current ?? mainWorkspaceRef.current;
        target?.focus();
      });
    }, 0);
  }

  useEffect(() => {
    if (previousActiveScreenRef.current === activeScreen) return;
    previousActiveScreenRef.current = activeScreen;
    const frame = window.requestAnimationFrame(() => {
      const target = activeScreenHeadingRef.current ?? mainWorkspaceRef.current;
      target?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeScreen]);

  useEffect(() => {
    let cancelled = false;

    async function loadModuleWorkspace() {
      setMetadataLoading(true);
      try {
        const moduleResponse = await apiGet<{ modules: ModuleMetadata[] }>('/metadata/modules');
        if (cancelled) return;
        setModules(moduleResponse.modules);

        const selectedIsAllowed = moduleResponse.modules.some((module) => module.id === selectedModule);
        const safeModule = selectedIsAllowed ? selectedModule : moduleResponse.modules[0]?.id;
        if (!safeModule) {
          throw new Error('No Fordisc modules are available for this account.');
        }
        if (safeModule !== selectedModule) {
          setSelectedModule(safeModule);
          return;
        }

        setResult(null);
        setApiError(null);
        setLastRunAt(null);

        if (isFreeTier) {
          // Fordisc Demo never receives measurement-entry metadata.  Its
          // server-owned test case is run by module ID only.
          setVariables([]);
          setAnalysisOptions(null);
          setWorkflow(null);
          setActiveScreen('results');
          return;
        }

        const [variableResponse, optionResponse, workflowResponse] = await Promise.all([
          apiGet<{ variables: VariableMetadata[] }>(`/metadata/variables?module=${safeModule}`),
          apiGet<{ analysis_options: AnalysisOptions }>(`/metadata/analysis-options?module=${safeModule}`),
          apiGet<{ workflow: Workflow }>(`/metadata/workflow?module=${safeModule}`)
        ]);
        if (cancelled) return;
        setVariables(variableResponse.variables);
        setAnalysisOptions(optionResponse.analysis_options);
        setWorkflow(workflowResponse.workflow);
        restoreCaseModuleState(safeModule, variableResponse.variables);
      } catch (error) {
        if (!cancelled) setApiError({ message: error instanceof Error ? error.message : String(error) });
      } finally {
        if (!cancelled) setMetadataLoading(false);
      }
    }

    loadModuleWorkspace();
    return () => {
      cancelled = true;
    };
  }, [selectedModule, isFreeTier, authorization.access_tier]);


  useEffect(() => {
    if (!capabilities.help) {
      setHelpDocument(null);
      setHelpError('');
      setHelpLoading(false);
      return;
    }
    let cancelled = false;
    setHelpLoading(true);
    apiGet<HelpDocument>('/help/fd4')
      .then((response) => {
        if (!cancelled) {
          setHelpDocument(response);
          setHelpError('');
        }
      })
      .catch((error: Error) => {
        if (!cancelled) setHelpError(error.message);
      })
      .finally(() => {
        if (!cancelled) setHelpLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [capabilities.help]);


  useEffect(() => {
    persistInterfaceLanguage(interfaceLanguage);
    applyLanguageToDocument(interfaceLanguage);
  }, [interfaceLanguage]);

  useEffect(() => {
    caseModuleStatesRef.current = caseModuleStates;
  }, [caseModuleStates]);


  useEffect(() => {
    const allowedModules = capabilities.modules ?? [];
    if (!allowedModules.includes(selectedModule) && allowedModules.length > 0) {
      setSelectedModule(allowedModules[0]);
      return;
    }

    const allowedScreens = new Set(capabilities.screens ?? []);
    if (!allowedScreens.has(activeScreen)) {
      if (isFreeTier) setActiveScreen('results');
      else if (isStudentTier) setActiveScreen('measurement_entry');
      else setActiveScreen('start_case_setup');
    }

    if (isStudentTier) {
      // Mirror the backend's Student-safe analysis contract so the visible UI
      // always reflects the options that will actually be used.
      setCheckMeasurementErrors(true);
      setTransformationMode('none');
      setStepwiseMode('none');
      setClassifyCase(true);
      setClassificationRateMode('loocv');
      setClassifyOnlyIfTypF(true);
      setClassifyOnlyIfTypFThreshold('0.01');
      setExcludeIdsText('');
      setUseCustomReferenceAnalysis(false);
    }
  }, [authorization.access_tier, activeScreen, selectedModule, capabilities.modules.join('|'), capabilities.screens.join('|'), isFreeTier, isStudentTier]);

  useEffect(() => {
    if (!pendingLegacyCaseSelection || metadataLoading || !analysisOptions) return;
    if (pendingLegacyCaseSelection.module !== selectedModule) return;
    setSelectedGroups(new Set(pendingLegacyCaseSelection.groups));
    setPendingLegacyCaseSelection(null);
  }, [pendingLegacyCaseSelection, selectedModule, metadataLoading, analysisOptions]);

  const selectedModuleRecord = modules.find((module) => module.id === selectedModule);
  const activeVariableNames = useMemo(() => new Set(variables.map((variable) => variable.variable)), [variables]);
  const effectiveCaseValues = useMemo(() => ({ ...caseValues, ...calculateCranialValues(caseValues) }), [caseValues]);
  const activeIncludedVariables = useMemo(
    () => new Set(Array.from(includedVariables).filter((variable) => activeVariableNames.has(variable))),
    [includedVariables, activeVariableNames]
  );
  const selectedVariableCount = activeIncludedVariables.size;
  const selectedStatureVariables = useMemo(
    () => STATURE_VARIABLE_ORDER.filter((variable) => activeIncludedVariables.has(variable)),
    [activeIncludedVariables]
  );
  const selectedStatureVariableSet = useMemo(() => new Set(selectedStatureVariables), [selectedStatureVariables]);
  const selectedStatureVariableCount = selectedStatureVariables.length;
  const populatedVariableCount = variables.filter((variable) => String(effectiveCaseValues[variable.variable] ?? '').trim() !== '').length;
  const minimumGroupCount = analysisOptions?.groups.minimum_group_count ?? 1;
  const clientValidation = useMemo(
    () => buildClientValidation(effectiveCaseValues, activeIncludedVariables, variables, checkMeasurementErrors, classifyCase),
    [effectiveCaseValues, activeIncludedVariables, variables, checkMeasurementErrors, classifyCase]
  );
  const statureClientValidation = useMemo(
    () => buildClientValidation(effectiveCaseValues, selectedStatureVariableSet, variables, checkMeasurementErrors, true),
    [effectiveCaseValues, selectedStatureVariableSet, variables, checkMeasurementErrors]
  );
  const customReferenceRunState = useMemo(
    () => buildCustomReferenceRunState(importPreview, activeIncludedVariables),
    [importPreview, activeIncludedVariables]
  );
  const hasCustomReferenceAnalysis = useCustomReferenceAnalysis && customReferenceRunState.ready;
  const dfaAnalysisSignature = useMemo(
    () => buildDfaAnalysisSignature(effectiveCaseValues, activeIncludedVariables, selectedGroups, selectedModule, checkMeasurementErrors, outlierDetectionThreshold, nearestNeighborCount, excludeIdsText, useCustomReferenceAnalysis, importPreview?.groupMode ?? null, transformationMode, stepwiseMode, stepwiseMinVariables, stepwiseMaxVariables, stepwiseThreshold, stepwiseTurbo, stepwiseWeighting, classifyOnlyIfTypF, classifyOnlyIfTypFThreshold, classifyCase, classificationRateMode),
    [effectiveCaseValues, activeIncludedVariables, selectedGroups, selectedModule, checkMeasurementErrors, outlierDetectionThreshold, nearestNeighborCount, excludeIdsText, useCustomReferenceAnalysis, importPreview?.groupMode, transformationMode, stepwiseMode, stepwiseMinVariables, stepwiseMaxVariables, stepwiseThreshold, stepwiseTurbo, stepwiseWeighting, classifyOnlyIfTypF, classifyOnlyIfTypFThreshold, classifyCase, classificationRateMode]
  );
  const resolvedStatureSelection = useMemo(
    () => resolveStandaloneStatureSelection(
      statureGroupMode,
      statureManualGroup,
      lastPostcranialClassifiedGroup,
      Boolean(lastPostcranialDfaSignature && lastPostcranialDfaSignature === dfaAnalysisSignature)
    ),
    [statureGroupMode, statureManualGroup, lastPostcranialClassifiedGroup, lastPostcranialDfaSignature, dfaAnalysisSignature]
  );
  const statureAnalysisSignature = useMemo(
    () => buildStatureAnalysisSignature(effectiveCaseValues, selectedStatureVariableSet, checkMeasurementErrors, statureLevel, statureMaxTerms, statureDisplayRows, statureBirthyearMin, statureBirthyearMax, statureIncludeBirthyearMissing, statureReference, statureGroupMode, statureManualGroup, statureSortBy, resolvedStatureSelection.group),
    [effectiveCaseValues, selectedStatureVariableSet, checkMeasurementErrors, statureLevel, statureMaxTerms, statureDisplayRows, statureBirthyearMin, statureBirthyearMax, statureIncludeBirthyearMissing, statureReference, statureGroupMode, statureManualGroup, statureSortBy, resolvedStatureSelection.group]
  );
  const resultSignature = result?.operation === 'stature' ? statureAnalysisSignature : dfaAnalysisSignature;
  const resultIsStale = Boolean(result && lastRunSignature && lastRunSignature !== resultSignature);
  const readyToRunDfa =
    capabilities.arbitrary_analysis &&
    selectedVariableCount > 0 &&
    (hasCustomReferenceAnalysis || selectedGroups.size >= minimumGroupCount) &&
    clientValidation.errors.length === 0;
  const readyToRunStature =
    capabilities.arbitrary_analysis &&
    selectedModule === 'postcranial_stature' &&
    selectedStatureVariableCount > 0 &&
    statureClientValidation.errors.length === 0 &&
    resolvedStatureSelection.ready;
  const canRunDfa = readyToRunDfa && !loading;
  const canRunStature = readyToRunStature && !loading;

  const groupedVariables = useMemo(() => {
    const groups = new Map<string, VariableMetadata[]>();
    for (const variable of variables) {
      const section = variable.entry_section || variable.body_region || 'other';
      if (!groups.has(section)) groups.set(section, []);
      groups.get(section)!.push(variable);
    }
    return Array.from(groups.entries()).map(([region, records]) => [
      region,
      records.sort((a, b) => (a.display_order ?? 9999) - (b.display_order ?? 9999))
    ] as const);
  }, [variables]);

  function isDefaultSelectableVariable(variable: VariableMetadata) {
    // FD3-style standard cranial analyses restore calculated/auxiliary values but do not
    // check them by default.  Users may still explicitly toggle them if a supported
    // workflow calls for it.
    if (selectedModule === 'cranial_fdb_dfa' && CRANIAL_FDB_CALCULATED.has(variable.variable)) return false;
    if (selectedModule === 'cranial_howells_dfa' && CRANIAL_HOWELLS_CALCULATED.has(variable.variable)) return false;
    return true;
  }

  function currentModuleStateSnapshot(): CaseModuleState {
    return {
      selected_variables: Array.from(includedVariables),
      selected_groups: Array.from(selectedGroups),
      classify_case: classifyCase,
      classification_rate_estimation: classificationRateMode
    };
  }

  function storeModuleState(moduleId: ModuleId, state: CaseModuleState) {
    const next = { ...caseModuleStatesRef.current, [moduleId]: state };
    caseModuleStatesRef.current = next;
    setCaseModuleStates(next);
    return next;
  }

  function storeCurrentModuleState() {
    return storeModuleState(selectedModule, currentModuleStateSnapshot());
  }

  function restoreCaseModuleState(moduleId: ModuleId, moduleVariables: VariableMetadata[] = variables) {
    const savedState = caseModuleStatesRef.current[moduleId];
    if (savedState) {
      setIncludedVariables(new Set(filterDefaultSelectableNames(savedState.selected_variables ?? [], moduleId, moduleVariables)));
      setSelectedGroups(new Set(savedState.selected_groups ?? []));
      if (savedState.classify_case !== undefined) setClassifyCase(savedState.classify_case !== false);
      if (savedState.classification_rate_estimation) setClassificationRateMode(savedState.classification_rate_estimation === 'resubstitution' ? 'resubstitution' : 'loocv');
      return;
    }

    // Case files are case-wide.  When a module has not yet been configured for
    // the current case, start with populated, non-calculated variables for that
    // module so cranial and postcranial data can live in the same saved case.
    const activeNames = new Set(moduleVariables.map((variable) => variable.variable));
    const nextEffectiveValues = { ...caseValues, ...calculateCranialValues(caseValues) };
    const populated = moduleVariables
      .filter((variable) => activeNames.has(variable.variable) && String(nextEffectiveValues[variable.variable] ?? '').trim() !== '')
      .map((variable) => variable.variable);
    setIncludedVariables(new Set(filterDefaultSelectableNames(populated, moduleId, moduleVariables)));
    setSelectedGroups(new Set());
  }

  function changeModule(moduleId: ModuleId) {
    if (moduleId === selectedModule || !capabilities.modules.includes(moduleId)) return;
    if (!isFreeTier) storeCurrentModuleState();
    setUseCustomReferenceAnalysis(false);
    setVariableSelectionStatus('');
    setSelectedModule(moduleId);
    setActiveScreen(isFreeTier ? 'results' : 'measurement_entry');
    setResult(null);
    setApiError(null);
    setLastRunAt(null);
    setLastRunSignature(null);
  }

  function loadValidationExample() {
    if (!capabilities.manual_data_entry) return;
    setVariableSelectionStatus('');
    resetAnalysisOptionsToDefaults();
    const fixture = fixtures[selectedModule];
    const nextValues: Record<string, string> = {};
    for (const [key, value] of Object.entries(fixture.case)) {
      nextValues[key] = String(value);
    }
    setCaseValues(nextValues);
    setIncludedVariables(new Set(fixture.variables));
    setSelectedGroups(new Set(fixture.groups));
    const nextModuleStates: Partial<Record<ModuleId, CaseModuleState>> = {
      [selectedModule]: {
        selected_variables: fixture.variables,
        selected_groups: fixture.groups,
        classify_case: true,
        classification_rate_estimation: 'loocv'
      }
    };
    caseModuleStatesRef.current = nextModuleStates;
    setCaseModuleStates(nextModuleStates);
    setUseCustomReferenceAnalysis(false);
    setImportPreview(null);
    setCaseId(DEMO_CASE_ID_BY_MODULE[selectedModule]);
    setApiError(null);
    setResult(null);
    setLastRunAt(null);
    setLastRunSignature(null);
    setLastPostcranialClassifiedGroup(null);
    setLastPostcranialDfaSignature(null);
    setLegacyCasePreview(null);
    setLegacyCaseStatus('');
    setCaseNotes('');
    setRunLogEntries([]);
    setClassifyCase(true);
    setClassificationRateMode('loocv');
  }

  function saveCurrentCase() {
    const moduleStatesForSave = {
      ...caseModuleStatesRef.current,
      [selectedModule]: currentModuleStateSnapshot()
    };
    caseModuleStatesRef.current = moduleStatesForSave;
    setCaseModuleStates(moduleStatesForSave);
    const activeSavedState = moduleStatesForSave[selectedModule] ?? currentModuleStateSnapshot();
    const payload = {
      file_type: 'fordisc4_case',
      schema_version: 4,
      case_scope: 'case',
      saved_at: new Date().toISOString(),
      app: 'FORDISC 4.0',
      active_module: selectedModule,
      case_id: caseId,
      measurements: caseValues,
      module_states: moduleStatesForSave,
      selected_variables: activeSavedState.selected_variables,
      selected_groups: activeSavedState.selected_groups,
      classify_case: activeSavedState.classify_case !== false,
      classification_rate_estimation: activeSavedState.classification_rate_estimation ?? classificationRateMode,
      stature_options: {
        level: statureLevel,
        max_terms: statureMaxTerms,
        display_rows: statureDisplayRows,
        birthyear_min: statureBirthyearMin,
        birthyear_max: statureBirthyearMax,
        include_birthyear_missing: statureIncludeBirthyearMissing,
        reference: statureReference,
        group_mode: statureGroupMode,
        manual_group: statureManualGroup,
        sort_by: statureSortBy,
        units: statureUnits
      },
      case_notes: caseNotes,
      run_log: runLogEntries
    };
    const safeCaseId = sanitizeFileName(caseId.trim() || 'case');
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/vnd.fordisc4.case+json;charset=utf-8' });
    triggerDownload(blob, `${safeCaseId}.fd4case`);
  }

  function openSavedCase() {
    caseFileInputRef.current?.click();
  }

  function openFd3CaseFile() {
    fd3CaseFileInputRef.current?.click();
  }

  async function buildAllModuleVariableMetadata() {
    const moduleIds: ModuleId[] = ['cranial_fdb_dfa', 'cranial_howells_dfa', 'cranial_international_dfa', 'postcranial_stature'];
    const responses = await Promise.all(moduleIds.map((moduleId) => apiGet<{ variables: VariableMetadata[] }>(`/metadata/variables?module=${moduleId}`)));
    const variableMap = new Map<string, VariableMetadata>();
    for (const response of responses) {
      for (const variable of response.variables) {
        const existing = variableMap.get(variable.variable);
        if (!existing) {
          variableMap.set(variable.variable, { ...variable, modules: [...(variable.modules ?? [])] });
        } else {
          const modules = new Set([...(existing.modules ?? []), ...(variable.modules ?? [])]);
          variableMap.set(variable.variable, { ...existing, modules: Array.from(modules) });
        }
      }
    }
    return Array.from(variableMap.values());
  }

  async function handleFd3CaseFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;
    const primary = files.find((file) => /\.adt$/i.test(file.name)) ?? files.find((file) => /\.(csv|txt)$/i.test(file.name)) ?? files.find((file) => /\.dbf$/i.test(file.name)) ?? files[0];
    const admFiles = files.filter((file) => /\.adm$/i.test(file.name));
    const admSelected = admFiles.length > 0;
    const ext = primary.name.split('.').pop()?.toLowerCase() ?? '';
    setLegacyCaseStatus('');
    try {
      const allVariables = await buildAllModuleVariableMetadata();
      let parsed: { headers: string[]; rows: Array<Record<string, string>> };
      if (ext === 'adt' || ext === 'dbf' || ext === 'db') {
        const buffer = await primary.arrayBuffer();
        parsed = ext === 'adt' ? parseAdvantageTable(buffer) : parseDbaseTable(buffer);
      } else if (ext === 'csv' || ext === 'txt') {
        const text = await primary.text();
        parsed = parseDelimitedText(text, detectDelimiter(text, primary.name));
      } else {
        throw new Error('Choose an FD3 case file saved as ADT, DBF, CSV, or TXT.');
      }
      const legacyMemoPointers = collectLegacyMemoPointers(parsed.headers, parsed.rows);
      const admMemoText = (await Promise.all(admFiles.map(async (file) => extractLegacyAdmMemoText(await file.arrayBuffer(), file.name, legacyMemoPointers)))).filter(Boolean).join('\n\n');
      const preview = buildLegacyFd3CasePreview(primary.name, ext, parsed.headers, parsed.rows, allVariables, admSelected, admMemoText);
      setLegacyCasePreview(preview);
      setLegacyCaseStatus('');
      setActiveScreen('measurement_entry');
    } catch (error) {
      setLegacyCasePreview(null);
      setLegacyCaseStatus(error instanceof Error ? error.message : 'FD3 case could not be opened.');
    } finally {
      if (fd3CaseFileInputRef.current) fd3CaseFileInputRef.current.value = '';
    }
  }

  function applyLegacyFd3Case(preview: LegacyFd3CasePreview) {
    resetAnalysisOptionsToDefaults();
    setCaseId(preview.caseId || preview.fileName.replace(/\.[^.]+$/i, ''));
    setCaseValues(preview.measurements);
    const nextSelectedVariables = filterDefaultSelectableNames(preview.selectedVariables, preview.suggestedModule, variables);
    setIncludedVariables(new Set(nextSelectedVariables));
    const nextModuleStates: Partial<Record<ModuleId, CaseModuleState>> = {
      [preview.suggestedModule]: {
        selected_variables: nextSelectedVariables,
        selected_groups: preview.selectedGroups,
        classify_case: true,
        classification_rate_estimation: 'loocv'
      }
    };
    caseModuleStatesRef.current = nextModuleStates;
    setCaseModuleStates(nextModuleStates);
    setUseCustomReferenceAnalysis(false);
    setImportPreview(null);
    setResult(null);
    setApiError(null);
    setLastRunAt(null);
    setLastRunSignature(null);
    setCaseNotes(preview.comments ? `Imported from ${preview.commentsSource || 'FD3 comments'}:
${preview.comments}` : '');
    setRunLogEntries([]);
    setClassifyCase(true);
    setClassificationRateMode('loocv');
    setLegacyCaseStatus(`Opened FD3 case ${preview.caseId || preview.fileName}. Review measurements and groups before running analysis.${preview.comments ? ' Legacy comments were copied into Case Notes.' : ''}`);
    setLegacyCasePreview(null);
    setPendingLegacyCaseSelection({ module: preview.suggestedModule, groups: preview.selectedGroups });
    setSelectedModule(preview.suggestedModule);
    setActiveScreen('measurement_entry');
  }

  function handleSavedCaseFile(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(String(reader.result ?? '{}'));
        if (parsed.file_type !== 'fordisc4_case' || !parsed.measurements || typeof parsed.measurements !== 'object') {
          throw new Error('This does not look like a Fordisc 4 case file.');
        }
        const nextMeasurements: Record<string, string> = {};
        for (const [key, value] of Object.entries(parsed.measurements as Record<string, any>)) {
          if (value !== undefined && value !== null) nextMeasurements[key] = String(value);
        }
        const allowedCaseModules = CASE_MODULE_IDS.filter((moduleId) => capabilities.modules.includes(moduleId));
        // Case files preserve independent module states, but opening a case
        // always begins in FDB for a predictable FD3-style starting point.
        const nextModule = allowedCaseModules.includes(DEFAULT_MODULE) ? DEFAULT_MODULE : (allowedCaseModules[0] ?? selectedModule);
        resetAnalysisOptionsToDefaults();
        setSelectedModule(nextModule);
        setCaseId(String(parsed.case_id ?? file.name.replace(/\.fd4case$/i, '')));
        setCaseValues(nextMeasurements);
        setCaseNotes(String(parsed.case_notes ?? ''));
        const fallbackClassifyCase = parsed.classify_case !== false;
        const fallbackRateMode: ClassificationRateMode = parsed.classification_rate_estimation === 'resubstitution' ? 'resubstitution' : 'loocv';
        setClassifyCase(fallbackClassifyCase);
        setClassificationRateMode(fallbackRateMode);
        const savedStatureOptions = parsed.stature_options ?? {};
        setStatureLevel(String(savedStatureOptions.level ?? '0.90'));
        setStatureMaxTerms(String(savedStatureOptions.max_terms ?? '3'));
        setStatureDisplayRows(String(savedStatureOptions.display_rows ?? '25'));
        setStatureBirthyearMin(String(savedStatureOptions.birthyear_min ?? '1930'));
        setStatureBirthyearMax(String(savedStatureOptions.birthyear_max ?? ''));
        setStatureIncludeBirthyearMissing(savedStatureOptions.include_birthyear_missing !== false);
        setStatureReference(['19th_c_cstats', 'trotter_mstats', '20th_c_fstats'].includes(savedStatureOptions.reference) ? savedStatureOptions.reference : '20th_c_fstats');
        setStatureGroupMode(['any', 'classified', 'manual'].includes(savedStatureOptions.group_mode) ? savedStatureOptions.group_mode : 'any');
        setStatureManualGroup(STATURE_GROUP_OPTIONS.includes(savedStatureOptions.manual_group) ? savedStatureOptions.manual_group : 'Any');
        setStatureSortBy(savedStatureOptions.sort_by === 'r_square' ? 'r_square' : 'prediction_interval');
        setStatureUnits(savedStatureOptions.units === 'cm' ? 'cm' : 'in');
        setRunLogEntries(normalizeSavedRunLogEntries(parsed.run_log, Number(parsed.schema_version ?? 0)));
        const savedVariables = Array.isArray(parsed.selected_variables) ? parsed.selected_variables.map((value: any) => String(value)) : Object.keys(nextMeasurements);
        const savedGroups = Array.isArray(parsed.selected_groups) ? parsed.selected_groups.map((value: any) => String(value)) : [];
        const normalizedModuleStates = normalizeSavedCaseModuleStates(parsed, nextModule, savedVariables, savedGroups, fallbackClassifyCase, fallbackRateMode);
        const nextModuleStates = Object.fromEntries(
          Object.entries(normalizedModuleStates).filter(([moduleId]) => capabilities.modules.includes(moduleId as ModuleId))
        ) as Partial<Record<ModuleId, CaseModuleState>>;
        caseModuleStatesRef.current = nextModuleStates;
        setCaseModuleStates(nextModuleStates);
        const activeSavedState = nextModuleStates[nextModule] ?? {
          selected_variables: savedVariables,
          selected_groups: savedGroups,
          classify_case: fallbackClassifyCase,
          classification_rate_estimation: fallbackRateMode
        };
        setIncludedVariables(new Set(filterDefaultSelectableNames(activeSavedState.selected_variables, nextModule, variables)));
        setSelectedGroups(new Set(activeSavedState.selected_groups));
        if (activeSavedState.classify_case !== undefined) setClassifyCase(activeSavedState.classify_case !== false);
        if (activeSavedState.classification_rate_estimation) setClassificationRateMode(activeSavedState.classification_rate_estimation === 'resubstitution' ? 'resubstitution' : 'loocv');
        setUseCustomReferenceAnalysis(false);
        setImportPreview(null);
        setResult(null);
        setApiError(null);
        setLastRunAt(null);
        setLastRunSignature(null);
        setLastPostcranialClassifiedGroup(null);
        setLastPostcranialDfaSignature(null);
        setLegacyCasePreview(null);
        setLegacyCaseStatus('');
        setActiveScreen('measurement_entry');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Saved case could not be opened.';
        setApiError({ message });
        setActiveScreen('results');
      } finally {
        if (caseFileInputRef.current) caseFileInputRef.current.value = '';
      }
    };
    reader.onerror = () => {
      setApiError({ message: 'Saved case file could not be read.' });
      setActiveScreen('results');
    };
    reader.readAsText(file);
  }

  function resetCurrentWorkspace(targetScreen: string) {
    setVariableSelectionStatus('');
    resetAnalysisOptionsToDefaults();
    if (capabilities.modules.includes(DEFAULT_MODULE)) setSelectedModule(DEFAULT_MODULE);
    setCaseId('');
    setCaseValues({});
    setIncludedVariables(new Set());
    setResult(null);
    setApiError(null);
    setLastRunAt(null);
    setLastRunSignature(null);
    setLastPostcranialClassifiedGroup(null);
    setLastPostcranialDfaSignature(null);
    setSelectedGroups(new Set());
    caseModuleStatesRef.current = {};
    setCaseModuleStates({});
    setLegacyCasePreview(null);
    setLegacyCaseStatus('');
    setCaseNotes('');
    setRunLogEntries([]);
    setClassifyCase(true);
    setClassificationRateMode('loocv');
    setUseCustomReferenceAnalysis(false);
    setImportPreview(null);
    setActiveScreen(targetScreen);
  }

  function startNewCase() {
    resetCurrentWorkspace('measurement_entry');
  }

  function returnToHome() {
    resetCurrentWorkspace(
      isFreeTier
        ? 'results'
        : isStudentTier
          ? 'measurement_entry'
          : 'start_case_setup'
    );
  }

  function openImportDataWorkspace() {
    setImportDataEnabled(true);
    setLegacyCasePreview(null);
    setActiveScreen('import_data');
  }

  function handleImportPreviewChange(preview: ImportPreview | null) {
    setImportPreview(preview);
    setUseCustomReferenceAnalysis(Boolean(preview && !preview.unsupported));
  }

  function closeImportDataWorkspace() {
    setImportDataEnabled(false);
    if (activeScreen === 'import_data') setActiveScreen('analysis_options');
  }

  function applyImportedFirstRow(caseUpdates: Record<string, string>, variablesToInclude: string[]) {
    resetAnalysisOptionsToDefaults();
    setCaseValues((current) => ({ ...current, ...caseUpdates }));
    setIncludedVariables((current) => {
      const next = new Set<string>(current);
      for (const variable of variablesToInclude) next.add(variable);
      storeModuleState(selectedModule, {
        selected_variables: Array.from(next),
        selected_groups: Array.from(selectedGroups),
        classify_case: true,
        classification_rate_estimation: classificationRateMode
      });
      return next;
    });
    setResult(null);
    setApiError(null);
    setLastRunAt(null);
    setLastRunSignature(null);
    setCaseNotes('');
    setRunLogEntries([]);
    setActiveScreen('measurement_entry');
  }

  function clearMeasurements() {
    setVariableSelectionStatus('Measurements and variable selections cleared.');
    setCaseValues({});
    setIncludedVariables(new Set());
    setResult(null);
    setApiError(null);
    setLastRunAt(null);
    setLastRunSignature(null);
  }

  function setVariableValue(variable: string, value: string) {
    setVariableSelectionStatus('');
    setCaseValues((current) => ({ ...current, [variable]: value }));
    if (value.trim() !== '') {
      setIncludedVariables((current) => new Set(current).add(variable));
    }
  }

  function toggleVariable(variable: string) {
    setVariableSelectionStatus('');
    setIncludedVariables((current) => {
      const next = new Set(current);
      if (next.has(variable)) next.delete(variable);
      else next.add(variable);
      return next;
    });
  }

  function selectAllPopulated() {
    setIncludedVariables((current) => {
      const next = new Set(current);
      for (const variable of variables) {
        if (!isDefaultSelectableVariable(variable)) {
          next.delete(variable.variable);
        } else if (String(effectiveCaseValues[variable.variable] ?? '').trim() !== '') {
          next.add(variable.variable);
        } else {
          next.delete(variable.variable);
        }
      }
      return next;
    });
  }

  function selectAllVariables() {
    const selectableNames = variables.filter(isDefaultSelectableVariable).map((variable) => variable.variable);
    if (!classifyCase) {
      setIncludedVariables((current) => {
        const next = new Set(current);
        for (const variable of variables) next.delete(variable.variable);
        for (const variable of selectableNames) next.add(variable);
        return next;
      });
      setVariableSelectionStatus(`${selectableNames.length} available measurements selected for group-only analysis.`);
      return;
    }

    const populatedNames = selectableNames.filter((variable) => String(effectiveCaseValues[variable] ?? '').trim() !== '');
    setIncludedVariables((current) => {
      const next = new Set(current);
      for (const variable of variables) next.delete(variable.variable);
      for (const variable of populatedNames) next.add(variable);
      return next;
    });
    setVariableSelectionStatus(populatedNames.length
      ? `${populatedNames.length} entered measurements selected.`
      : 'No entered measurements are available to select. Uncheck Classify Case to select blank variables for group-only analysis.');
  }

  function clearSelectedVariables() {
    setVariableSelectionStatus('No measurements selected.');
    setIncludedVariables((current) => {
      const next = new Set(current);
      for (const variable of variables) next.delete(variable.variable);
      return next;
    });
  }

  function toggleGroup(groupId: string) {
    setUseCustomReferenceAnalysis(false);
    setSelectedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  function applyGroupPreset(groupIds: string[]) {
    setUseCustomReferenceAnalysis(false);
    setSelectedGroups(new Set(groupIds));
  }

  function toggleOutputSection(key: keyof OutputSectionSettings) {
    setOutputSections((current) => ({ ...current, [key]: !current[key] }));
  }

  function toggleTypicalityDisplay(key: keyof TypicalityDisplaySettings) {
    setTypicalityDisplay((current) => ({ ...current, [key]: !current[key] }));
  }

  function clearRunLog() {
    if (!runLogEntries.length) return;
    if (window.confirm('Clear all run-log entries for this case?')) setRunLogEntries([]);
  }

  function changeStepwiseMode(mode: StepwiseMode) {
    setStepwiseMode(mode);
    setStepwiseThreshold(stepwiseDefaultThreshold(mode));
  }

  function resetAnalysisOptionsToDefaults() {
    setCheckMeasurementErrors(true);
    setOutlierDetectionThreshold('0.005');
    setNearestNeighborCount('15');
    setExcludeIdsText('');
    setOutputSections({ ...DEFAULT_OUTPUT_SECTIONS });
    setStatureLevel(DEFAULT_STATURE_SETTINGS.level);
    setStatureMaxTerms(DEFAULT_STATURE_SETTINGS.maxTerms);
    setStatureDisplayRows(DEFAULT_STATURE_SETTINGS.displayRows);
    setStatureBirthyearMin(DEFAULT_STATURE_SETTINGS.birthyearMin);
    setStatureBirthyearMax(DEFAULT_STATURE_SETTINGS.birthyearMax);
    setStatureIncludeBirthyearMissing(DEFAULT_STATURE_SETTINGS.includeBirthyearMissing);
    setStatureReference(DEFAULT_STATURE_SETTINGS.reference);
    setStatureGroupMode(DEFAULT_STATURE_SETTINGS.groupMode);
    setStatureManualGroup(DEFAULT_STATURE_SETTINGS.manualGroup);
    setStatureSortBy(DEFAULT_STATURE_SETTINGS.sortBy);
    setStatureUnits(DEFAULT_STATURE_SETTINGS.units);
    setSortGroupsMode('distance');
    setTransformationMode('none');
    setStepwiseMode('none');
    setStepwiseMinVariables('1');
    setStepwiseMaxVariables('20');
    setStepwiseThreshold('0.005');
    setStepwiseTurbo(true);
    setStepwiseWeighting('unweighted');
    setClassifyOnlyIfTypF(true);
    setClassifyOnlyIfTypFThreshold('0.01');
    setClassifyCase(true);
    setClassificationRateMode('loocv');
    setClassificationMatrixMode('counts');
    setTypicalityDisplay({ ...DEFAULT_TYPICALITY_DISPLAY });
  }

  function numericCasePayload(includeCaseValues: boolean) {
    const numericCase: Record<string, number | string> = {};
    if (!includeCaseValues) return numericCase;
    for (const [key, rawValue] of Object.entries(effectiveCaseValues)) {
      const value = String(rawValue ?? '');
      if (value.trim() === '') continue;
      const numeric = Number(value);
      numericCase[key] = Number.isNaN(numeric) ? value : numeric;
    }
    return numericCase;
  }

  function recordSuccessfulAnalysis(response: AnalyzeResponse, signature: string, groupsForLog: string[]) {
    setResult(response);
    announceAccessibility(translateKey(response.operation === 'stature' ? 'a11y.stature_complete' : 'a11y.analysis_complete', interfaceLanguage));
    setLastRunSignature(signature);
    const runTimestamp = new Date();
    setLastRunAt(runTimestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    setRunLogEntries((current) => [...current, buildRunLogEntry(response, {
      timestamp: runTimestamp.toLocaleString(),
      module: selectedModule,
      caseId,
      stepwiseMode: response.operation === 'stature' ? 'none' : stepwiseMode,
      variables: Array.isArray(response.result?.variables_used)
        ? response.result.variables_used.map(String)
        : Array.from(activeIncludedVariables),
      groups: groupsForLog,
      sortGroupsMode,
      classificationMatrixMode,
      typicalityDisplay,
      statureUnits
    })]);
    setActiveScreen('results');
    focusActiveScreenSoon();
  }

  async function runDfaAnalysis() {
    if (!capabilities.arbitrary_analysis || !readyToRunDfa) return;
    setLoading(true);
    setActiveAnalysisTask('dfa');
    announceAccessibility(translateKey('a11y.analysis_started', interfaceLanguage));
    setApiError(null);
    setResult(null);
    const payload: Record<string, unknown> = {
      case: numericCasePayload(classifyCase),
      variables: Array.from(activeIncludedVariables),
      groups: Array.from(selectedGroups),
      analysis_module: selectedModule,
      verbose: true,
      check_measurement_errors: checkMeasurementErrors,
      skip_measurement_check: !checkMeasurementErrors,
      outlier_detection_threshold: parseNumberOrDefault(outlierDetectionThreshold, 0.005),
      nearest_neighbor_count: parseIntegerOrDefault(nearestNeighborCount, 15),
      exclude_ids: parseExcludeIds(excludeIdsText),
      transformation: transformationMode,
      stepwise: stepwiseMode,
      stepwise_min_vars: parseIntegerOrDefault(stepwiseMinVariables, 1),
      stepwise_max_vars: parseIntegerOrDefault(stepwiseMaxVariables, 20),
      stepwise_threshold: parseNumberOrDefault(stepwiseThreshold, Number(stepwiseDefaultThreshold(stepwiseMode))),
      stepwise_turbo: stepwiseTurbo,
      stepwise_weighting: stepwiseWeighting,
      classify_case: classifyCase,
      classification_rate_estimation: classificationRateMode,
      classify_only_if_typ_f: classifyOnlyIfTypF,
      classify_only_if_typ_f_threshold: parseNumberOrDefault(classifyOnlyIfTypFThreshold, 0.01)
    };
    if (selectedModule === 'cranial_howells_dfa') {
      payload.fd3_group_mode = 'popsex_raw';
      payload.apply_forensic_birthyear_filter = false;
    } else if (selectedModule === 'cranial_international_dfa') {
      payload.fd3_group_mode = 'popsex_raw';
      payload.apply_forensic_birthyear_filter = false;
    } else if (selectedModule === 'cranial_fdb_dfa') {
      payload.fd3_group_mode = 'legacy_20th';
      payload.apply_forensic_birthyear_filter = true;
    }
    try {
      let response: AnalyzeResponse;
      let groupsForLog: string[] = Array.from(selectedGroups);
      if (hasCustomReferenceAnalysis && importPreview) {
        const customRows = buildCustomReferenceRows(importPreview);
        const selectedCustomVariables = customReferenceRunState.variables;
        groupsForLog = customReferenceRunState.groups.map(String);
        response = await analyzeCustomReference({
          ...payload,
          variables: selectedCustomVariables,
          groups: customReferenceRunState.groups,
          reference_rows: customRows,
          id_column: 'ID',
          group_column: 'Pop',
          reference_label: importPreview.fileName,
          analysis_module: selectedModule
        });
      } else if (selectedModule === 'postcranial_stature') {
        response = await analyzePostcranialDfa(payload);
      } else {
        response = await analyze(selectedModule, payload);
      }
      if (selectedModule === 'postcranial_stature' && response.operation === 'postcranial_dfa') {
        const classifiedGroup = postcranialClassifiedGroup(response);
        setLastPostcranialClassifiedGroup(classifiedGroup);
        setLastPostcranialDfaSignature(dfaAnalysisSignature);
      }
      recordSuccessfulAnalysis(response, dfaAnalysisSignature, groupsForLog);
    } catch (error) {
      const enriched = error as Error & { body?: Record<string, any>; status?: number };
      setApiError({ status: enriched.status, message: enriched.message, body: enriched.body });
      announceAccessibility(translateKey('a11y.analysis_failed', interfaceLanguage), true);
      setActiveScreen('results');
      focusActiveScreenSoon();
    } finally {
      setLoading(false);
      setActiveAnalysisTask(null);
    }
  }

  async function runStatureAnalysis() {
    if (!capabilities.arbitrary_analysis || !readyToRunStature || !resolvedStatureSelection.group) return;
    setLoading(true);
    setActiveAnalysisTask('stature');
    announceAccessibility(translateKey('a11y.stature_started', interfaceLanguage));
    setApiError(null);
    setResult(null);
    const payload: Record<string, unknown> = {
      case: numericCasePayload(true),
      variables: selectedStatureVariables,
      groups: [resolvedStatureSelection.group],
      stature_group_mode: statureGroupMode,
      stature_group_note: resolvedStatureSelection.note,
      verbose: true,
      check_measurement_errors: checkMeasurementErrors,
      skip_measurement_check: !checkMeasurementErrors,
      level: parseNumberOrDefault(statureLevel, 0.90),
      max_terms: parseIntegerOrDefault(statureMaxTerms, 3),
      max_display_rows: parseIntegerOrDefault(statureDisplayRows, 25),
      birthyear_min: parseIntegerOrDefault(statureBirthyearMin, 1930),
      include_birthyear_missing: statureIncludeBirthyearMissing,
      stature_reference: statureReference,
      stature_sort_by: statureSortBy
    };
    if (statureBirthyearMax.trim()) payload.birthyear_max = Math.max(1, Math.round(Number(statureBirthyearMax)));
    try {
      const response = await analyzeStature(payload);
      recordSuccessfulAnalysis(response, statureAnalysisSignature, [resolvedStatureSelection.group]);
    } catch (error) {
      const enriched = error as Error & { body?: Record<string, any>; status?: number };
      setApiError({ status: enriched.status, message: enriched.message, body: enriched.body });
      announceAccessibility(translateKey('a11y.stature_failed', interfaceLanguage), true);
      setActiveScreen('results');
      focusActiveScreenSoon();
    } finally {
      setLoading(false);
      setActiveAnalysisTask(null);
    }
  }

  async function runModuleTestCase() {
    if (!capabilities.module_test_cases) return;
    setLoading(true);
    setActiveAnalysisTask('module_test');
    announceAccessibility(translateKey('a11y.demo_started', interfaceLanguage));
    setApiError(null);
    setResult(null);
    try {
      const response = await analyzeModuleTestCase(selectedModule);
      setResult(response);
      announceAccessibility(translateKey('a11y.demo_complete', interfaceLanguage));
      setLastRunSignature(null);
      const runTimestamp = new Date();
      setLastRunAt(runTimestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      setRunLogEntries((current) => [...current, buildRunLogEntry(response, {
        timestamp: runTimestamp.toLocaleString(),
        module: selectedModule,
        caseId: caseId || DEMO_CASE_ID_BY_MODULE[selectedModule],
        stepwiseMode,
        variables: Array.isArray(response.result?.variables_used) ? response.result.variables_used.map(String) : [],
        groups: Array.isArray(response.result?.group_selection?.resolved_groups)
          ? response.result.group_selection.resolved_groups.map(String)
          : Array.isArray(response.result?.groups) ? response.result.groups.map(String) : [],
        sortGroupsMode,
        classificationMatrixMode,
        typicalityDisplay,
        statureUnits
      })]);
      setActiveScreen('results');
      focusActiveScreenSoon();
    } catch (error) {
      const enriched = error as Error & { body?: Record<string, any>; status?: number };
      setApiError({ status: enriched.status, message: enriched.message, body: enriched.body });
      announceAccessibility(translateKey('a11y.demo_failed', interfaceLanguage), true);
      setActiveScreen('results');
      focusActiveScreenSoon();
    } finally {
      setLoading(false);
      setActiveAnalysisTask(null);
    }
  }

  const currentReferenceGroupCount = analysisGroupCount(result);
  const wideTableScreen = currentReferenceGroupCount > WIDE_TABLE_GROUP_THRESHOLD
    && (activeScreen === 'results' || activeScreen === 'extended_results');

  return (
    <div className={`app-shell${wideTableScreen ? ' wide-table-app-shell' : ''}`}>
      {accessibilityAnnouncement && (
        <div
          key={accessibilityAnnouncement.id}
          className="sr-only"
          role={accessibilityAnnouncement.urgent ? 'alert' : 'status'}
          aria-live={accessibilityAnnouncement.urgent ? 'assertive' : 'polite'}
          aria-atomic="true"
        >
          {accessibilityAnnouncement.text}
        </div>
      )}
      <header className="app-header">
        <button
          type="button"
          className="brand-lockup brand-home-button"
          onClick={returnToHome}
          aria-label="Clear the current analysis and return to the Fordisc home screen"
          title="Clear analysis and return home"
        >
          <img src="/FD4.ico" alt="" className="app-brand-icon" />
          <span className="app-brand-title">FORDISC 4.0</span>
        </button>
        <div className="header-actions">
          <label className="header-language-control">
            <span>Language</span>
            <select value={interfaceLanguage} onChange={(event) => setInterfaceLanguage(event.target.value as InterfaceLanguage)}>
              <option value="en">English</option>
              <option value="es">Español</option>
            </select>
          </label>
          {capabilities.case_files && (
            <>
              <label className="case-id-control">
                <span>Case ID</span>
                <input value={caseId} onChange={(event) => setCaseId(event.target.value)} placeholder="Optional" />
              </label>
              <button className="secondary header-button" onClick={startNewCase}>New case</button>
              <button className="secondary header-button" onClick={saveCurrentCase}>Save current case</button>
              <button className="secondary header-button" onClick={openSavedCase}>Open saved case</button>
              <input ref={caseFileInputRef} type="file" accept=".fd4case,.fordisc4,.json" className="hidden-file-input" onChange={(event) => handleSavedCaseFile(event.target.files?.[0] ?? null)} />
            </>
          )}
          {capabilities.fd3_case_import && (
            <>
              <button className="secondary header-button" onClick={openFd3CaseFile}>Open FD3 Case</button>
              <input ref={fd3CaseFileInputRef} type="file" multiple accept=".adt,.adm,.csv,.txt,.dbf,.db" className="hidden-file-input" onChange={(event) => handleFd3CaseFiles(event.target.files)} />
            </>
          )}
          {capabilities.manual_data_entry && capabilities.module_test_cases && (
            <button className="secondary header-button" onClick={loadValidationExample}>Open Demo Case</button>
          )}
          {isFreeTier ? (
            <button className="primary header-button" onClick={runModuleTestCase} disabled={loading} aria-busy={loading}>
              {activeAnalysisTask === 'module_test' ? 'Processing…' : 'Run Demo Case'}
            </button>
          ) : selectedModule === 'postcranial_stature' ? (
            <div className="header-analysis-actions" aria-label="Postcranial analysis actions">
              <button className="primary header-button" onClick={runDfaAnalysis} disabled={!canRunDfa} aria-busy={activeAnalysisTask === 'dfa'}>
                {activeAnalysisTask === 'dfa' ? 'Running DFA…' : 'Run Postcranial DFA'}
              </button>
              <button className="primary header-button" onClick={runStatureAnalysis} disabled={!canRunStature} aria-busy={activeAnalysisTask === 'stature'}>
                {activeAnalysisTask === 'stature' ? 'Estimating…' : 'Estimate Stature'}
              </button>
            </div>
          ) : (
            <button className="primary header-button" onClick={runDfaAnalysis} disabled={!canRunDfa} aria-busy={activeAnalysisTask === 'dfa'}>
              {activeAnalysisTask === 'dfa' ? 'Processing…' : 'Run Analysis'}
            </button>
          )}
        </div>
      </header>

      {loading && (
        <div className="analysis-loading-overlay" role="status" aria-live="polite">
          <div className="analysis-loading-card">
            <span className="analysis-loading-spinner" aria-hidden="true" />
            <strong>{activeAnalysisTask === 'stature' ? 'Estimating stature…' : 'Processing analysis…'}</strong>
            <span>{activeAnalysisTask === 'stature'
              ? 'Evaluating the selected stature reference sample and equations.'
              : selectedModule === 'cranial_howells_dfa' && selectedGroups.size >= 40
                ? 'Large Howells comparisons may take longer than smaller analyses. Keep this window open while FORDISC processes the analysis.'
                : 'Running FORDISC calculations.'}</span>
          </div>
        </div>
      )}

      <aside className="module-rail">
        <h2>Modules</h2>
        {modules.map((module) => (
          <button
            key={module.id}
            className={`module-card ${selectedModule === module.id ? 'active' : ''}`}
            aria-current={selectedModule === module.id ? 'page' : undefined}
            onClick={() => changeModule(module.id)}
          >
            <strong>{module.title}</strong>
          </button>
        ))}
      </aside>

      <main id="main-workspace" ref={mainWorkspaceRef} tabIndex={-1} className={`workspace${wideTableScreen ? ' wide-results-workspace' : ''}`}>
        <nav className="screen-tabs" aria-label="Workflow screens">
          {Array.from(new Set([
            ...(workflow?.navigation_order ?? SCREEN_ORDER).filter((screenId) => screenId !== 'help' && screenId !== 'reference_group_world_map'),
            ...(importDataEnabled ? ['import_data'] : []),
            'help',
            'reference_group_world_map'
          ]))
            .filter((screenId) => SCREEN_ORDER.includes(screenId) && capabilities.screens.includes(screenId))
            .map((screenId) => {
              return (
                <button
                  data-i18n-skip="true"
                  key={screenId}
                  className={activeScreen === screenId ? 'active' : ''}
                  aria-current={activeScreen === screenId ? 'page' : undefined}
                  onClick={() => setActiveScreen(screenId)}
                >
                  {localizedScreenTitle(screenId, interfaceLanguage)}
                </button>
              );
            })}
        </nav>

        <section className={`screen-card${wideTableScreen ? ' wide-results-screen-card' : ''}`}>
          {activeScreen !== 'start_case_setup' && (
            <div className="screen-heading">
              <div>
                <p className="eyebrow">{activeScreen === 'reference_group_world_map' ? 'Howells' : (selectedModuleRecord?.title ?? selectedModule)}</p>
                <h2 id="active-screen-heading" ref={activeScreenHeadingRef} tabIndex={-1} data-i18n-skip="true">{localizedScreenTitle(activeScreen, interfaceLanguage)}</h2>
              </div>
              {metadataLoading && <span className="inline-status-text">Loading…</span>}
            </div>
          )}


          {capabilities.fd3_case_import && legacyCaseStatus && <div className="action-status legacy-case-status">{legacyCaseStatus}</div>}
          {capabilities.fd3_case_import && legacyCasePreview && (
            <LegacyFd3CasePreviewPanel
              preview={legacyCasePreview}
              modules={modules}
              onOpen={() => applyLegacyFd3Case(legacyCasePreview)}
              onCancel={() => { setLegacyCasePreview(null); setLegacyCaseStatus(''); }}
            />
          )}

          {isFullTier && activeScreen === 'start_case_setup' && (
            <StartScreen workflow={workflow} selectedModule={selectedModule} caseId={caseId} onBegin={() => setActiveScreen('measurement_entry')} />
          )}

          {capabilities.manual_data_entry && activeScreen === 'measurement_entry' && (
            <div className="stack">
              {analysisOptions && (
                <CompactReferenceGroupPanel
                  interfaceLanguage={interfaceLanguage}
                  analysisOptions={analysisOptions}
                  selectedGroups={selectedGroups}
                  onToggleGroup={toggleGroup}
                  onApplyPreset={applyGroupPreset}
                  onClearGroups={() => setSelectedGroups(new Set())}
                  module={selectedModule}
                />
              )}
              {isStudentTier && selectedModule === 'postcranial_stature' && analysisOptions && (
                <StudentAnalysisSetup
                  analysisOptions={analysisOptions}
                  selectedGroups={selectedGroups}
                  onToggleGroup={toggleGroup}
                  onApplyPreset={applyGroupPreset}
                  onClearGroups={() => setSelectedGroups(new Set())}
                  selectedModule={selectedModule}
                  statureLevel={statureLevel}
                  onStatureLevelChange={setStatureLevel}
                  statureReference={statureReference}
                  onStatureReferenceChange={setStatureReference}
                  statureGroupMode={statureGroupMode}
                  onStatureGroupModeChange={setStatureGroupMode}
                  statureManualGroup={statureManualGroup}
                  onStatureManualGroupChange={setStatureManualGroup}
                  statureSortBy={statureSortBy}
                  onStatureSortByChange={setStatureSortBy}
                  statureBirthyearMin={statureBirthyearMin}
                  onStatureBirthyearMinChange={setStatureBirthyearMin}
                  statureBirthyearMax={statureBirthyearMax}
                  onStatureBirthyearMaxChange={setStatureBirthyearMax}
                  statureIncludeBirthyearMissing={statureIncludeBirthyearMissing}
                  onStatureIncludeBirthyearMissingChange={setStatureIncludeBirthyearMissing}
                  statureUnits={statureUnits}
                  onStatureUnitsChange={setStatureUnits}
                  showReferenceGroups={false}
                />
              )}
              <MeasurementScreen
                interfaceLanguage={interfaceLanguage}
                groupedVariables={groupedVariables}
                caseValues={effectiveCaseValues}
                includedVariables={activeIncludedVariables}
                validationByVariable={clientValidation.byVariable}
                onValueChange={setVariableValue}
                onToggleVariable={toggleVariable}
                onSelectAllVariables={selectAllVariables}
                onClearSelectedVariables={clearSelectedVariables}
                onClearMeasurements={clearMeasurements}
                checkMeasurementErrors={checkMeasurementErrors}
                selectionStatus={variableSelectionStatus}
                classifyCase={classifyCase}
                showOptionsButton={capabilities.analysis_options}
                onOpenOptions={() => setActiveScreen('analysis_options')}
                module={selectedModule}
              />
              {selectedModule !== 'postcranial_stature' && (
                <section className="panel measurement-run-footer" aria-label="Run analysis at the end of Measurement Entry">
                  <button className="primary" onClick={runDfaAnalysis} disabled={!canRunDfa} aria-busy={activeAnalysisTask === 'dfa'}>
                    {activeAnalysisTask === 'dfa' ? 'Processing…' : 'Run Analysis'}
                  </button>
                </section>
              )}
              {selectedModule === 'postcranial_stature' && (
                <PostcranialAnalysisPanel
                  selectedVariableCount={selectedVariableCount}
                  selectedStatureVariableCount={selectedStatureVariableCount}
                  selectedGroupCount={selectedGroups.size}
                  minimumGroupCount={minimumGroupCount}
                  canRunDfa={canRunDfa}
                  canRunStature={canRunStature}
                  loading={loading}
                  activeTask={activeAnalysisTask}
                  statureSelection={resolvedStatureSelection}
                  dfaValidation={clientValidation}
                  statureValidation={statureClientValidation}
                  onRunDfa={runDfaAnalysis}
                  onRunStature={runStatureAnalysis}
                  onOpenOptions={capabilities.analysis_options ? () => setActiveScreen('analysis_options') : undefined}
                />
              )}
            </div>
          )}

          {capabilities.analysis_options && activeScreen === 'analysis_options' && analysisOptions && (
            <OptionsScreen
              analysisOptions={analysisOptions}
              checkMeasurementErrors={checkMeasurementErrors}
              onCheckMeasurementErrorsChange={setCheckMeasurementErrors}
              outlierDetectionThreshold={outlierDetectionThreshold}
              onOutlierDetectionThresholdChange={setOutlierDetectionThreshold}
              nearestNeighborCount={nearestNeighborCount}
              onNearestNeighborCountChange={setNearestNeighborCount}
              excludeIdsText={excludeIdsText}
              onExcludeIdsTextChange={setExcludeIdsText}
              outputSections={outputSections}
              onToggleOutputSection={toggleOutputSection}
              selectedModule={selectedModule}
              statureLevel={statureLevel}
              onStatureLevelChange={setStatureLevel}
              statureMaxTerms={statureMaxTerms}
              onStatureMaxTermsChange={setStatureMaxTerms}
              statureDisplayRows={statureDisplayRows}
              onStatureDisplayRowsChange={setStatureDisplayRows}
              statureBirthyearMin={statureBirthyearMin}
              onStatureBirthyearMinChange={setStatureBirthyearMin}
              statureBirthyearMax={statureBirthyearMax}
              onStatureBirthyearMaxChange={setStatureBirthyearMax}
              statureIncludeBirthyearMissing={statureIncludeBirthyearMissing}
              onStatureIncludeBirthyearMissingChange={setStatureIncludeBirthyearMissing}
              statureReference={statureReference}
              onStatureReferenceChange={setStatureReference}
              statureGroupMode={statureGroupMode}
              onStatureGroupModeChange={setStatureGroupMode}
              statureManualGroup={statureManualGroup}
              onStatureManualGroupChange={setStatureManualGroup}
              statureSortBy={statureSortBy}
              onStatureSortByChange={setStatureSortBy}
              statureUnits={statureUnits}
              onStatureUnitsChange={setStatureUnits}
              result={displayResult}
              sortGroupsMode={sortGroupsMode}
              onSortGroupsModeChange={setSortGroupsMode}
              transformationMode={transformationMode}
              onTransformationModeChange={setTransformationMode}
              stepwiseMode={stepwiseMode}
              onStepwiseModeChange={changeStepwiseMode}
              stepwiseMinVariables={stepwiseMinVariables}
              onStepwiseMinVariablesChange={setStepwiseMinVariables}
              stepwiseMaxVariables={stepwiseMaxVariables}
              onStepwiseMaxVariablesChange={setStepwiseMaxVariables}
              stepwiseThreshold={stepwiseThreshold}
              onStepwiseThresholdChange={setStepwiseThreshold}
              stepwiseTurbo={stepwiseTurbo}
              onStepwiseTurboChange={setStepwiseTurbo}
              stepwiseWeighting={stepwiseWeighting}
              onStepwiseWeightingChange={setStepwiseWeighting}
              classifyOnlyIfTypF={classifyOnlyIfTypF}
              onClassifyOnlyIfTypFChange={setClassifyOnlyIfTypF}
              classifyOnlyIfTypFThreshold={classifyOnlyIfTypFThreshold}
              onClassifyOnlyIfTypFThresholdChange={setClassifyOnlyIfTypFThreshold}
              classifyCase={classifyCase}
              onClassifyCaseChange={setClassifyCase}
              classificationRateMode={classificationRateMode}
              onClassificationRateModeChange={setClassificationRateMode}
              classificationMatrixMode={classificationMatrixMode}
              onClassificationMatrixModeChange={setClassificationMatrixMode}
              typicalityDisplay={typicalityDisplay}
              onToggleTypicalityDisplay={toggleTypicalityDisplay}
              onOpenImportData={openImportDataWorkspace}
            />
          )}

          {activeScreen === 'results' && (
            isFreeTier && !result && !apiError ? (
              <FreeModuleTestCaseScreen
                moduleTitle={selectedModuleRecord?.title ?? moduleShortTitle(selectedModule)}
                loading={loading}
                onRun={runModuleTestCase}
              />
            ) : (
              <ResultsScreen
                result={displayResult}
                apiError={apiError}
                onRun={isFreeTier ? runModuleTestCase : runDfaAnalysis}
                loading={loading}
                activeTask={activeAnalysisTask}
                canRun={isFreeTier ? !loading : canRunDfa}
                validation={clientValidation}
                postcranialActions={!isFreeTier && selectedModule === 'postcranial_stature' ? {
                  onRunDfa: runDfaAnalysis,
                  onRunStature: runStatureAnalysis,
                  canRunDfa,
                  canRunStature,
                  statureValidation: statureClientValidation,
                  statureSelection: resolvedStatureSelection,
                  selectedVariableCount,
                  selectedStatureVariableCount,
                  selectedGroupCount: selectedGroups.size,
                  minimumGroupCount,
                  onOpenOptions: capabilities.analysis_options ? () => setActiveScreen('analysis_options') : undefined
                } : undefined}
                onOpenMeasurements={capabilities.manual_data_entry ? () => setActiveScreen('measurement_entry') : undefined}
                onOpenGroups={capabilities.manual_data_entry ? () => setActiveScreen('measurement_entry') : undefined}
                groupActionLabel="Analysis setup"
                showOutlierActions={capabilities.outlier_exclusion}
                resultIsStale={resultIsStale}
                lastRunAt={lastRunAt}
                checkMeasurementErrors={checkMeasurementErrors}
                excludeIdsText={excludeIdsText}
                onExcludeIdsTextChange={setExcludeIdsText}
                sortGroupsMode={sortGroupsMode}
                classificationMatrixMode={classificationMatrixMode}
                typicalityDisplay={typicalityDisplay}
                statureUnits={statureUnits}
                classifyCase={classifyCase}
              />
            )
          )}

          {capabilities.extended_results && activeScreen === 'extended_results' && (
            <ExtendedResultsScreen result={displayResult} excludeIdsText={excludeIdsText} onExcludeIdsTextChange={setExcludeIdsText} outputSections={outputSections} classificationMatrixMode={classificationMatrixMode} typicalityDisplay={typicalityDisplay} statureUnits={statureUnits} />
          )}

          {activeScreen === 'graph' && (
            <GraphScreen result={displayResult} module={selectedModule} allowDownload={capabilities.report_export} statureUnits={statureUnits} />
          )}

          {capabilities.custom_reference && activeScreen === 'import_data' && (
            <ImportDataScreen
              variables={variables}
              selectedModule={selectedModule}
              selectedModuleTitle={selectedModuleRecord?.title ?? selectedModule}
              importPreview={importPreview}
              onImportPreviewChange={handleImportPreviewChange}
              onApplyFirstRow={applyImportedFirstRow}
              onCloseImportData={closeImportDataWorkspace}
              useCustomReferenceAnalysis={useCustomReferenceAnalysis}
              onUseCustomReferenceAnalysisChange={setUseCustomReferenceAnalysis}
            />
          )}

          {capabilities.help && activeScreen === 'help' && (
            <HelpScreen document={helpDocument} loading={helpLoading} error={helpError} />
          )}

          {capabilities.reference_group_map && activeScreen === 'reference_group_world_map' && (
            <ReferenceGroupWorldMap language={interfaceLanguage} />
          )}

          {capabilities.notes_run_log && activeScreen === 'notes_run_log' && (
            <NotesRunLogScreen interfaceLanguage={interfaceLanguage} caseNotes={caseNotes} onCaseNotesChange={setCaseNotes} runLogEntries={displayRunLogEntries} onClearRunLog={clearRunLog} caseId={caseId} />
          )}

          {capabilities.report_export && activeScreen === 'export_report' && (
            <ExportScreen interfaceLanguage={interfaceLanguage} result={displayResult} selectedModule={selectedModule} caseId={caseId} runLogEntries={displayRunLogEntries} analystName={reportAnalystName} onAnalystNameChange={setReportAnalystName} sortGroupsMode={sortGroupsMode} classificationMatrixMode={classificationMatrixMode} typicalityDisplay={typicalityDisplay} statureUnits={statureUnits} transformationMode={transformationMode} stepwiseMode={stepwiseMode} stepwiseMinVariables={stepwiseMinVariables} stepwiseMaxVariables={stepwiseMaxVariables} stepwiseThreshold={stepwiseThreshold} stepwiseTurbo={stepwiseTurbo} stepwiseWeighting={stepwiseWeighting} classifyOnlyIfTypF={classifyOnlyIfTypF} classifyOnlyIfTypFThreshold={classifyOnlyIfTypFThreshold} classifyCase={classifyCase} classificationRateMode={classificationRateMode} checkMeasurementErrors={checkMeasurementErrors} outlierDetectionThreshold={outlierDetectionThreshold} nearestNeighborCount={nearestNeighborCount} excludeIdsText={excludeIdsText} />
          )}
        </section>
      </main>
    </div>
  );
}


function isModuleId(value: unknown): value is ModuleId {
  return CASE_MODULE_IDS.includes(String(value) as ModuleId);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter((item) => item.trim() !== '') : [];
}

function normalizeSavedCaseModuleStates(parsed: any, fallbackModule: ModuleId, fallbackVariables: string[], fallbackGroups: string[], fallbackClassifyCase: boolean, fallbackRateMode: ClassificationRateMode): Partial<Record<ModuleId, CaseModuleState>> {
  const next: Partial<Record<ModuleId, CaseModuleState>> = {};
  const rawStates = parsed?.module_states && typeof parsed.module_states === 'object' ? parsed.module_states : null;
  if (rawStates) {
    for (const [rawModule, rawState] of Object.entries(rawStates as Record<string, any>)) {
      if (!isModuleId(rawModule) || !rawState || typeof rawState !== 'object') continue;
      const selectedVariables = stringArray((rawState as any).selected_variables ?? (rawState as any).selectedVariables);
      const selectedGroups = stringArray((rawState as any).selected_groups ?? (rawState as any).selectedGroups);
      next[rawModule] = {
        selected_variables: selectedVariables,
        selected_groups: selectedGroups,
        classify_case: (rawState as any).classify_case !== false,
        classification_rate_estimation: (rawState as any).classification_rate_estimation === 'resubstitution' ? 'resubstitution' : 'loocv'
      };
    }
  }
  if (!next[fallbackModule]) {
    next[fallbackModule] = {
      selected_variables: fallbackVariables,
      selected_groups: fallbackGroups,
      classify_case: fallbackClassifyCase,
      classification_rate_estimation: fallbackRateMode
    };
  }
  return next;
}

function filterDefaultSelectableNames(names: string[], moduleId: ModuleId, currentVariables: VariableMetadata[] = []) {
  const metadataByVariable = new Map(currentVariables.map((variable) => [variable.variable, variable]));
  return names.filter((name) => {
    const variableName = String(name);
    const metadata = metadataByVariable.get(variableName);
    if (metadata?.calculated) return false;
    if (moduleId === 'cranial_fdb_dfa' && CRANIAL_FDB_CALCULATED.has(variableName)) return false;
    if (moduleId === 'cranial_howells_dfa' && CRANIAL_HOWELLS_CALCULATED.has(variableName)) return false;
    return true;
  });
}

function cloneRunLogData<T>(value: T): T {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

function compactRunLogStepwise(stepwise: Record<string, any> | undefined) {
  if (!stepwise || typeof stepwise !== 'object') return undefined;
  return {
    active: Boolean(stepwise.active),
    label: stepwise.label,
    selection_metric: stepwise.selection_metric,
    selected_variable_count: stepwise.selected_variable_count,
    original_variable_count: stepwise.original_variable_count,
    selected_variables: Array.isArray(stepwise.selected_variables) ? stepwise.selected_variables.slice() : undefined,
    threshold: stepwise.threshold,
    weighting: stepwise.weighting,
    min_variables: stepwise.min_variables,
    max_variables: stepwise.max_variables,
    turbo: stepwise.turbo,
    best_score: stepwise.best_score
  };
}

function compactRunLogOutliers(outliers: Record<string, any> | undefined) {
  if (!outliers || typeof outliers !== 'object') return undefined;
  return {
    detected_count: outliers.detected_count,
    excluded_count: outliers.excluded_count,
    detection_threshold: outliers.detection_threshold,
    warning: outliers.warning
  };
}

function buildResultsPageSnapshot(response: AnalyzeResponse): AnalyzeResponse {
  const result = response.result ?? {};
  const extended = result.extended_results ?? {};
  const classification = extended.classification ? cloneRunLogData(extended.classification) : undefined;
  const extendedOutliers = compactRunLogOutliers(extended.outliers);
  const snapshotResult: Record<string, any> = {
    input_validation: cloneRunLogData(result.input_validation ?? {}),
    measurements_removed: Array.isArray(result.measurements_removed) ? result.measurements_removed.slice() : [],
    outliers: compactRunLogOutliers(result.outliers) ?? extendedOutliers,
    case_representation_warning: cloneRunLogData(result.case_representation_warning),
    classification_safeguard: cloneRunLogData(result.classification_safeguard),
    classification: cloneRunLogData(result.classification),
    relationship: Array.isArray(result.relationship) ? cloneRunLogData(result.relationship) : [],
    measurement_checks: Array.isArray(result.measurement_checks) ? cloneRunLogData(result.measurement_checks.slice(0, 25)) : [],
    model_summary: cloneRunLogData(result.model_summary),
    variables_used: Array.isArray(result.variables_used) ? result.variables_used.slice() : [],
    groups: Array.isArray(result.groups) ? result.groups.slice() : [],
    group_selection: result.group_selection ? {
      resolved_groups: Array.isArray(result.group_selection.resolved_groups) ? result.group_selection.resolved_groups.slice() : []
    } : undefined,
    custom_reference: cloneRunLogData(result.custom_reference),
    transformation: result.transformation,
    stepwise: compactRunLogStepwise(result.stepwise ?? extended.stepwise),
    best_estimate: cloneRunLogData(result.best_estimate),
    top_results: Array.isArray(result.top_results) ? cloneRunLogData(result.top_results.slice(0, 25)) : undefined,
    stature_result_count: result.stature_result_count,
    result_count: result.result_count,
    stature_displayed_count: result.stature_displayed_count,
    displayed_count: result.displayed_count,
    stature_options: cloneRunLogData(result.stature_options),
    extended_results: (classification || extendedOutliers) ? {
      classification,
      outliers: extendedOutliers
    } : undefined
  };
  return cloneRunLogData({
    ok: response.ok,
    operation: response.operation,
    engine_version: response.engine_version,
    wrapper_version: response.wrapper_version,
    response_mode: 'default',
    result: snapshotResult
  });
}

function buildRunLogEntry(result: AnalyzeResponse, context: {
  timestamp: string;
  module: ModuleId;
  caseId: string;
  stepwiseMode: StepwiseMode;
  variables: string[];
  groups: string[];
  sortGroupsMode: SortGroupsMode;
  classificationMatrixMode: ClassificationMatrixMode;
  typicalityDisplay: TypicalityDisplaySettings;
  statureUnits: StatureUnits;
}): RunLogEntry {
  const snapshot = buildResultsPageSnapshot(result);
  const snapshotResult = snapshot.result ?? {};
  if (!Array.isArray(snapshotResult.variables_used) || !snapshotResult.variables_used.length) snapshotResult.variables_used = context.variables.slice();
  if (!Array.isArray(snapshotResult.groups) || !snapshotResult.groups.length) snapshotResult.groups = context.groups.slice();
  if (!snapshotResult.stepwise) snapshotResult.stepwise = { active: context.stepwiseMode !== 'none', label: stepwiseModeLabel(context.stepwiseMode) };
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    timestamp: context.timestamp,
    module: context.module,
    caseId: context.caseId || '—',
    resultSnapshot: snapshot,
    displaySettings: {
      sortGroupsMode: context.sortGroupsMode,
      classificationMatrixMode: context.classificationMatrixMode,
      typicalityDisplay: { ...context.typicalityDisplay },
      statureUnits: context.statureUnits
    },
    graphSnapshots: buildRunLogGraphSnapshots(analyzeResponseForDisplay(result) ?? result, context.statureUnits)
  };
}

function normalizeSavedAnalyzeResponse(value: any): AnalyzeResponse | undefined {
  if (!value || typeof value !== 'object' || !value.result || typeof value.result !== 'object') return undefined;
  return {
    ok: value.ok !== false,
    operation: String(value.operation ?? 'analysis'),
    engine_version: String(value.engine_version ?? ''),
    wrapper_version: String(value.wrapper_version ?? ''),
    response_mode: value.response_mode === 'extended' ? 'extended' : 'default',
    result: cloneRunLogData(value.result)
  };
}

function normalizeSavedGraphSnapshots(value: any): CaseReportGraphSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((snapshot: any): CaseReportGraphSnapshot | null => {
      const title = String(snapshot?.title ?? '').trim();
      const fileName = String(snapshot?.fileName ?? snapshot?.file_name ?? '').trim();
      const content = String(snapshot?.content ?? '').trim();
      if (!title || !fileName || !content || !content.includes('<svg')) return null;
      return { title, fileName, content };
    })
    .filter((snapshot): snapshot is CaseReportGraphSnapshot => Boolean(snapshot));
}

function normalizeSavedRunLogEntries(value: any, schemaVersion: number): RunLogEntry[] {
  if (!Array.isArray(value)) return [];
  const normalized = value.map((entry: any, index: number): RunLogEntry => {
    const resultSnapshot = normalizeSavedAnalyzeResponse(entry?.resultSnapshot ?? entry?.result_snapshot ?? entry?.result);
    const rawDisplay = entry?.displaySettings ?? entry?.display_settings ?? {};
    const displaySettings: RunLogDisplaySettings = {
      sortGroupsMode: rawDisplay.sortGroupsMode === 'group_name' || rawDisplay.sort_groups_mode === 'group_name' ? 'group_name' : 'distance',
      classificationMatrixMode: rawDisplay.classificationMatrixMode === 'percentages' || rawDisplay.classification_matrix_mode === 'percentages' ? 'percentages' : 'counts',
      typicalityDisplay: {
        f: rawDisplay.typicalityDisplay?.f !== false && rawDisplay.typicality_display?.f !== false,
        chi: rawDisplay.typicalityDisplay?.chi !== false && rawDisplay.typicality_display?.chi !== false,
        ranked: rawDisplay.typicalityDisplay?.ranked !== false && rawDisplay.typicality_display?.ranked !== false
      },
      statureUnits: rawDisplay.statureUnits === 'cm' || rawDisplay.stature_units === 'cm' ? 'cm' : 'in'
    };
    const hasLegacySummary = ['stepwise', 'variables', 'groups', 'classification', 'predicted', 'dSquared', 'posterior', 'typicalityF', 'accuracy']
      .some((key) => entry?.[key] !== undefined && entry?.[key] !== null && String(entry[key]).trim() !== '');
    return {
      id: String(entry?.id ?? `saved-${index}`),
      timestamp: String(entry?.timestamp ?? ''),
      module: String(entry?.module ?? ''),
      caseId: String(entry?.caseId ?? entry?.case_id ?? ''),
      resultSnapshot,
      displaySettings,
      graphSnapshots: normalizeSavedGraphSnapshots(entry?.graphSnapshots ?? entry?.graph_snapshots),
      legacySummary: !resultSnapshot && hasLegacySummary ? {
        stepwise: String(entry?.stepwise ?? ''),
        variables: String(entry?.variables ?? ''),
        groups: String(entry?.groups ?? ''),
        classification: String(entry?.classification ?? entry?.predicted ?? ''),
        dSquared: String(entry?.dSquared ?? entry?.d_squared ?? ''),
        posterior: String(entry?.posterior ?? ''),
        typicalityF: String(entry?.typicalityF ?? entry?.typicality_f ?? ''),
        accuracy: String(entry?.accuracy ?? '')
      } : undefined
    };
  });
  // v1.0.13.2 and earlier prepended new entries. Schema 4 appends them,
  // matching the chronological FD3 running-log behavior.
  return schemaVersion >= 4 ? normalized : normalized.reverse();
}

function analysisGroupNames(response: AnalyzeResponse | null | undefined) {
  const result = response?.result ?? {};
  const candidates: unknown[] = [
    result.group_selection?.resolved_groups,
    result.groups,
    Array.isArray(result.relationship) ? result.relationship.map((row: Record<string, any>) => row.group) : undefined
  ];
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    const names = candidate.map((value) => String(value ?? '').trim()).filter(Boolean);
    if (names.length) return Array.from(new Set(names));
  }
  return [] as string[];
}

function analysisGroupCount(response: AnalyzeResponse | null | undefined) {
  return analysisGroupNames(response).length;
}

function RunLogPrintDocument({ runLogEntries, caseId }: { runLogEntries: RunLogEntry[]; caseId: string }) {
  return (
    <main className="run-log-print-document">
      <header className="run-log-print-document-header">
        <div>
          <p className="run-log-print-eyebrow">Run Log</p>
          <h1>FORDISC 4.0 Run Log</h1>
          <p>Case ID: {caseId.trim() || '—'} · Generated {new Date().toLocaleString()}</p>
        </div>
        <div className="run-log-print-stamp">{runLogEntries.length} {runLogEntries.length === 1 ? 'RUN' : 'RUNS'}</div>
      </header>
      <div className="run-log-results-list run-log-print-results-list">
        {runLogEntries.map((entry, entryIndex) => {
          const display = entry.displaySettings ?? {
            sortGroupsMode: 'distance' as SortGroupsMode,
            classificationMatrixMode: 'counts' as ClassificationMatrixMode,
            typicalityDisplay: { ...DEFAULT_TYPICALITY_DISPLAY },
            statureUnits: 'in' as StatureUnits
          };
          const wideEntry = analysisGroupCount(entry.resultSnapshot) > WIDE_TABLE_GROUP_THRESHOLD;
          return (
            <article className={`run-log-results-entry run-log-print-entry${wideEntry ? ' run-log-print-wide-entry' : ''}`} key={entry.id}>
              <header className="run-log-entry-header">
                <h4>RUN {entryIndex + 1} — {entry.timestamp || 'Timestamp unavailable'}</h4>
                <span>{runLogModuleLabel(entry.module)} · Case ID: {entry.caseId || '—'}</span>
              </header>
              {entry.resultSnapshot ? (
                <ResultsPageContent
                  result={entry.resultSnapshot}
                  showOutlierActions={false}
                  resultIsStale={false}
                  excludeIdsText=""
                  onExcludeIdsTextChange={() => undefined}
                  sortGroupsMode={display.sortGroupsMode}
                  classificationMatrixMode={display.classificationMatrixMode}
                  typicalityDisplay={display.typicalityDisplay}
                  statureUnits={display.statureUnits}
                  embedded
                />
              ) : entry.legacySummary ? (
                <LegacyRunLogSummaryView summary={entry.legacySummary} />
              ) : (
                <EmptyPanel title="Run details unavailable" message="This saved entry predates the full Results-page Run Log." />
              )}
            </article>
          );
        })}
      </div>
      <footer className="run-log-print-footer">Generated from FORDISC 4.0.</footer>
    </main>
  );
}

function printableStylesheetMarkup() {
  return Array.from(document.head.querySelectorAll('link[rel="stylesheet"], style')).map((node) => {
    if (node instanceof HTMLLinkElement) {
      const media = node.media ? ` media="${escapeHtml(node.media)}"` : '';
      return `<link rel="stylesheet" href="${escapeHtml(node.href)}"${media} />`;
    }
    return node.outerHTML;
  }).join('\n');
}

function runLogPrintPageCss(maxGroupCount: number) {
  if (maxGroupCount <= WIDE_TABLE_GROUP_THRESHOLD) return '@page { size: letter portrait; margin: 12mm; }';
  if (maxGroupCount <= 24) return '@page { size: letter landscape; margin: 10mm; }';
  // Large Howells matrices cannot remain legible on letter paper. Use an
  // extra-wide digital PDF page rather than wrapping or omitting columns.
  const pageWidthInches = Math.min(24, 11 + ((maxGroupCount - 24) * 0.23));
  return `@page { size: ${pageWidthInches.toFixed(2)}in 11in; margin: 10mm; }`;
}

function buildRunLogPrintHtml(runLogEntries: RunLogEntry[], caseId: string, interfaceLanguage: InterfaceLanguage) {
  const baseName = sanitizeFileName(caseId.trim() || 'fordisc4_case');
  const maxGroupCount = runLogEntries.reduce((maximum, entry) => Math.max(maximum, analysisGroupCount(entry.resultSnapshot)), 0);
  const hasWideRun = maxGroupCount > WIDE_TABLE_GROUP_THRESHOLD;
  const pageCss = runLogPrintPageCss(maxGroupCount);
  const markup = renderToStaticMarkup(<RunLogPrintDocument runLogEntries={runLogEntries} caseId={caseId} />);
  const html = `<!doctype html>
<html lang="${interfaceLanguage === 'es' ? 'es' : 'en'}">
<head>
<meta charset="utf-8" />
<base href="${escapeHtml(document.baseURI)}" />
<title>${escapeHtml(baseName)} Run Log</title>
${printableStylesheetMarkup()}
<style>${pageCss}</style>
</head>
<body class="fd4-run-log-print-document${hasWideRun ? ' has-wide-run-log' : ''}">
${markup}
</body>
</html>`;
  return localizeHtmlDocument(html, interfaceLanguage);
}

function printRunLogPdf(runLogEntries: RunLogEntry[], caseId: string, interfaceLanguage: InterfaceLanguage) {
  if (!runLogEntries.length) return;
  const reportWindow = window.open('', '_blank');
  if (!reportWindow) return;
  reportWindow.document.open();
  reportWindow.document.write(buildRunLogPrintHtml(runLogEntries, caseId, interfaceLanguage));
  reportWindow.document.close();

  let printStarted = false;
  const startPrint = () => {
    if (printStarted || reportWindow.closed) return;
    printStarted = true;
    reportWindow.focus();
    reportWindow.print();
  };
  if (reportWindow.document.readyState === 'complete') {
    window.setTimeout(startPrint, 300);
  } else {
    reportWindow.addEventListener('load', () => window.setTimeout(startPrint, 250), { once: true });
    window.setTimeout(startPrint, 1400);
  }
}

function LegacyRunLogSummaryView({ summary }: { summary: LegacyRunLogSummary }) {
  const rows = [{
    'Stepwise mode': summary.stepwise || 'None',
    Variables: summary.variables,
    Groups: summary.groups,
    Classification: summary.classification || '—',
    'D²': summary.dSquared,
    Posterior: summary.posterior,
    'Typ. F': summary.typicalityF,
    Accuracy: summary.accuracy
  }];
  return <GenericTable title="Legacy Run Summary" rows={rows} />;
}

function runLogModuleLabel(module: string) {
  if (CASE_MODULE_IDS.includes(module as ModuleId)) return moduleShortTitle(module as ModuleId);
  return module ? humanize(module) : 'Analysis';
}

function NotesRunLogScreen({ interfaceLanguage, caseNotes, onCaseNotesChange, runLogEntries, onClearRunLog, caseId }: { interfaceLanguage: InterfaceLanguage; caseNotes: string; onCaseNotesChange: (value: string) => void; runLogEntries: RunLogEntry[]; onClearRunLog: () => void; caseId: string }) {
  const baseName = sanitizeFileName(caseId.trim() || 'fordisc4_case');
  return (
    <div className="stack notes-run-log-stack">
      <section className="panel case-notes-panel">
        <div className="section-title-row">
          <h3>Case Notes</h3>
        </div>
        <textarea
          aria-label="Case Notes"
          className="case-notes-textarea"
          value={caseNotes}
          onChange={(event) => onCaseNotesChange(event.target.value)}
          placeholder="Enter case notes, review observations, or FORDISC 3/FORDISC 4.0 comparison notes…"
        />
        <div className="toolbar export-toolbar">
          <button className="secondary" disabled={!caseNotes.trim()} onClick={() => downloadText(caseNotes, `${baseName}_case_notes.txt`)}>Export notes TXT</button>
        </div>
      </section>

      <section className="panel run-log-panel">
        <div className="section-title-row">
          <h3>Run Log</h3>
          <span className="section-count">{runLogEntries.length}</span>
        </div>
        <p className="helper-text">Each completed analysis is appended with a full copy of the Results page and saved with the FORDISC case file.</p>
        {runLogEntries.length === 0 ? (
          <EmptyPanel title="No logged runs yet" message="Run an analysis to add the first Results entry." />
        ) : (
          <div className="run-log-results-list">
            {runLogEntries.map((entry, entryIndex) => {
              const display = entry.displaySettings ?? {
                sortGroupsMode: 'distance' as SortGroupsMode,
                classificationMatrixMode: 'counts' as ClassificationMatrixMode,
                typicalityDisplay: { ...DEFAULT_TYPICALITY_DISPLAY },
                statureUnits: 'in' as StatureUnits
              };
              return (
                <article className="run-log-results-entry" key={entry.id}>
                  <header className="run-log-entry-header">
                    <h4>RUN {entryIndex + 1} — {entry.timestamp || 'Timestamp unavailable'}</h4>
                    <span>{runLogModuleLabel(entry.module)} · Case ID: {entry.caseId || '—'}</span>
                  </header>
                  {entry.resultSnapshot ? (
                    <ResultsPageContent
                      result={entry.resultSnapshot}
                      showOutlierActions={false}
                      resultIsStale={false}
                      excludeIdsText=""
                      onExcludeIdsTextChange={() => undefined}
                      sortGroupsMode={display.sortGroupsMode}
                      classificationMatrixMode={display.classificationMatrixMode}
                      typicalityDisplay={display.typicalityDisplay}
                      statureUnits={display.statureUnits}
                      embedded
                    />
                  ) : entry.legacySummary ? (
                    <LegacyRunLogSummaryView summary={entry.legacySummary} />
                  ) : (
                    <EmptyPanel title="Run details unavailable" message="This saved entry predates the full Results-page Run Log." />
                  )}
                </article>
              );
            })}
          </div>
        )}
        <div className="toolbar export-toolbar">
          <button className="secondary emphasized-export" disabled={!runLogEntries.length} onClick={() => printRunLogPdf(runLogEntries, caseId, interfaceLanguage)}>Export Run Log as PDF</button>
          <button className="danger" disabled={!runLogEntries.length} onClick={onClearRunLog}>Clear run log</button>
        </div>
      </section>
    </div>
  );
}

function LegacyFd3CasePreviewPanel({ preview, modules, onOpen, onCancel }: { preview: LegacyFd3CasePreview; modules: ModuleMetadata[]; onOpen: () => void; onCancel: () => void }) {
  const moduleTitle = modules.find((module) => module.id === preview.suggestedModule)?.title ?? preview.suggestedModule;
  const shownGroups = preview.selectedGroups.slice(0, 16);
  const shownVariables = preview.selectedVariables.slice(0, 18);
  return (
    <section className="panel legacy-case-preview-panel">
      <div className="section-title-row">
        <div>
          <p className="eyebrow">Legacy FD3 case</p>
          <h3>Open FD3 Case Summary</h3>
        </div>
        <div className="legacy-case-actions">
          <button className="primary compact-action" onClick={onOpen}>Open Case</button>
          <button className="secondary compact-action" onClick={onCancel}>Cancel</button>
        </div>
      </div>
      <div className="import-summary-grid legacy-case-summary-grid">
        <div><span>File</span><strong>{preview.fileName}</strong></div>
        <div><span>Case ID</span><strong>{preview.caseId || 'Not found'}</strong></div>
        <div><span>Suggested module</span><strong>{moduleTitle}</strong></div>
        <div><span>Measurements</span><strong>{preview.selectedVariables.length}</strong></div>
        <div><span>Selected groups</span><strong>{preview.selectedGroups.length}</strong></div>
        <div><span>Rows</span><strong>{preview.rowCount}</strong></div>
        <div><span>Case notes</span><strong>{preview.commentsRestored ? preview.commentsSource : preview.commentsAvailable ? 'Memo present' : 'None detected'}</strong></div>
      </div>
      {preview.warnings.length > 0 && (
        <div className="warning-panel compact-warning-panel">
          <h3>Review before opening</h3>
          <ul>{preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </div>
      )}
      <div className="grid two legacy-case-detail-grid">
        <div className="option-card">
          <strong>Groups restored</strong>
          <p>{shownGroups.length ? shownGroups.join(', ') : 'No selected groups detected.'}{preview.selectedGroups.length > shownGroups.length ? `, +${preview.selectedGroups.length - shownGroups.length} more` : ''}</p>
          {preview.groupAliases.length > 0 && <p className="muted-copy">Aliases applied: {preview.groupAliases.map((alias) => `${alias.raw} → ${alias.mapped}`).join(', ')}</p>}
        </div>
        <div className="option-card">
          <strong>Measurements restored</strong>
          <p>{shownVariables.length ? shownVariables.join(', ') : 'No measurements detected.'}{preview.selectedVariables.length > shownVariables.length ? `, +${preview.selectedVariables.length - shownVariables.length} more` : ''}</p>
        </div>
        {preview.commentsRestored && (
          <div className="option-card legacy-comments-card">
            <strong>{preview.commentsSource} copied to Case Notes</strong>
            <p>{preview.comments.length > 260 ? `${preview.comments.slice(0, 260)}…` : preview.comments}</p>
          </div>
        )}
      </div>
    </section>
  );
}

function ReadinessCard(props: {
  moduleTitle: string;
  selectedVariableCount: number;
  populatedVariableCount: number;
  selectedGroupCount: number;
  minimumGroupCount: number;
  validation: ClientValidation;
  ready: boolean;
}) {
  return (
    <section className={`readiness-card ${props.ready ? 'ready' : ''}`}>
      <h3>{props.ready ? 'Ready to run' : 'Needs attention'}</h3>
      <dl>
        <div><dt>Module</dt><dd>{props.moduleTitle}</dd></div>
        <div><dt>Values entered</dt><dd>{props.populatedVariableCount}</dd></div>
        <div><dt>Variables selected</dt><dd>{props.selectedVariableCount}</dd></div>
        <div><dt>Groups selected</dt><dd>{props.selectedGroupCount}/{props.minimumGroupCount}+ needed</dd></div>
        <div><dt>Input checks</dt><dd>{props.validation.errors.length} errors / {props.validation.warnings.length} warnings</dd></div>
        
      </dl>
    </section>
  );
}

function OptionsCard(props: {
  checkMeasurementErrors: boolean;
  onCheckMeasurementErrorsChange: (value: boolean) => void;
  outlierDetectionThreshold: string;
  onOutlierDetectionThresholdChange: (value: string) => void;
  nearestNeighborCount: string;
  onNearestNeighborCountChange: (value: string) => void;
}) {
  return (
    <section className="readiness-card options-card">
      <h3>Options</h3>
      <label className={`measurement-error-control measurement-error-control-compact ${props.checkMeasurementErrors ? 'is-on' : 'is-off'}`}>
        <input type="checkbox" checked={props.checkMeasurementErrors} onChange={(event) => props.onCheckMeasurementErrorsChange(event.target.checked)} />
        <span className="measurement-error-control-copy"><strong>Check for measurement error</strong></span>
        <span className="measurement-error-control-status">{props.checkMeasurementErrors ? 'On' : 'Off'}</span>
      </label>
      <label className="sidebar-field-label">
        <span>Outlier threshold</span>
        <input
          value={props.outlierDetectionThreshold}
          onChange={(event) => props.onOutlierDetectionThresholdChange(event.target.value)}
          inputMode="decimal"
          aria-label="Outlier threshold"
        />
      </label>
      <label className="sidebar-field-label">
        <span>Nearest neighbors</span>
        <input
          value={props.nearestNeighborCount}
          onChange={(event) => props.onNearestNeighborCountChange(event.target.value)}
          inputMode="numeric"
          aria-label="Nearest neighbors"
        />
      </label>
    </section>
  );
}

function StatusChip({ label, value, state }: { label: string; value: string; state: 'ok' | 'warning' | 'error' | 'neutral' }) {
  return <div className={`status-chip ${state}`}><span>{label}</span><strong>{value}</strong></div>;
}

function StartScreen({ workflow, selectedModule, caseId, onBegin }: { workflow: Workflow | null; selectedModule: ModuleId; caseId: string; onBegin: () => void }) {
  return (
    <div className="stack start-screen-stack start-screen-minimal start-screen-v51">
      <section className="panel start-identity-panel start-identity-panel-v51">
        <div className="start-logo-stage">
          <img src="/Fordisc4_logo.png" alt="FORDISC 4.0 logo" className="start-fordisc-logo" />
        </div>
        <div className="start-identity-copy">
          <h3>FORDISC 4.0</h3>
          <p className="start-description">FORDISC is an interactive analytical program for estimating population affinity, sex, and stature using flexible combinations of standard cranial and postcranial variables.</p>
          <div className="start-action-row">
            <button type="button" className="primary start-begin-button" onClick={onBegin}>
              Begin FORDISC
            </button>
          </div>
          <div className="start-attribution-row compact-attribution-row start-attribution-inline">
            <img src="/Forensic_Anthro_black_slides.png" alt="University of Tennessee Forensic Anthropology Center" className="start-fac-logo start-fac-logo-inline" />
            <p className="start-copyright">Copyright 1993, 1996, 2005, 2026<br />University of Tennessee</p>
          </div>
        </div>
      </section>
    </div>
  );
}

function moduleShortTitle(module: ModuleId) {
  if (module === 'cranial_fdb_dfa') return 'FDB';
  if (module === 'cranial_howells_dfa') return 'Howells';
  if (module === 'cranial_international_dfa') return 'International Crania';
  return 'Postcranial';
}

const POSTCRANIAL_REGION_ORDER = [
  'Clavicle',
  'Scapula',
  'Humerus',
  'Radius',
  'Ulna',
  'Sacrum',
  'Innominate',
  'Femur',
  'Tibia',
  'Fibula',
  'Calcaneus'
] as const;

function MeasurementScreen(props: {
  interfaceLanguage: InterfaceLanguage;
  groupedVariables: ReadonlyArray<readonly [string, VariableMetadata[]]>;
  caseValues: Record<string, string>;
  includedVariables: Set<string>;
  validationByVariable: Record<string, ClientValidationItem[]>;
  onValueChange: (variable: string, value: string) => void;
  onToggleVariable: (variable: string) => void;
  onSelectAllVariables: () => void;
  onClearSelectedVariables: () => void;
  onClearMeasurements: () => void;
  checkMeasurementErrors: boolean;
  selectionStatus: string;
  classifyCase: boolean;
  showOptionsButton: boolean;
  onOpenOptions: () => void;
  module: ModuleId;
}) {
  const visibleGroups = props.groupedVariables;

  function renderMeasurementCell(variable: VariableMetadata) {
    const range = variable.range ? `${variable.range.lower}–${variable.range.upper} ${variable.units ?? ''}`.trim() : 'No FD3 range available';
    const validationItems = props.validationByVariable[variable.variable] ?? [];
    const hasError = validationItems.some((item) => item.severity === 'error');
    const hasWarning = validationItems.some((item) => item.severity === 'warning');
    const isExtreme = validationItems.some((item) => item.type === 'far_outside_expected_range');
    const isCalculated = Boolean(variable.calculated);
    const baseId = `measurement-${slugify(variable.variable)}`;
    const helpId = `${baseId}-help`;
    const validationId = `${baseId}-validation`;
    const describedBy = [helpId, validationItems.length ? validationId : ''].filter(Boolean).join(' ');
    const useMeasurementLabel = props.interfaceLanguage === 'es'
      ? `Usar ${variable.variable}, ${variable.label}, en el análisis`
      : `Use ${variable.variable}, ${variable.label}, in analysis`;
    const rangeLabel = translateKey('a11y.expected_range', props.interfaceLanguage);
    return (
      <div className={`measurement-cell ${isCalculated ? 'cell-calculated' : ''} ${hasError ? 'cell-error' : hasWarning ? 'cell-warning' : ''} ${isExtreme ? 'cell-extreme-warning' : ''}`} key={variable.variable}>
        <div className="measurement-cell-top">
          <code>{variable.variable}</code>
          <label className="use-mini">
            <input
              type="checkbox"
              checked={props.includedVariables.has(variable.variable)}
              onChange={() => props.onToggleVariable(variable.variable)}
              aria-label={useMeasurementLabel}
              aria-describedby={helpId}
            />
          </label>
        </div>
        <p id={helpId} className="measurement-assistive-text sr-only">{variable.label}. {rangeLabel}: {range}.</p>
        <input
          className="value-input compact-value-input"
          inputMode="decimal"
          value={props.caseValues[variable.variable] ?? ''}
          onChange={(event) => { if (!isCalculated) props.onValueChange(variable.variable, event.target.value); }}
          aria-label={`${variable.variable} ${variable.label}`}
          aria-describedby={describedBy}
          aria-invalid={hasError ? 'true' : undefined}
          placeholder={isCalculated ? 'calc' : ''}
          readOnly={isCalculated}
        />
        {isCalculated && <p className="calculated-note">calculated</p>}
        {validationItems.length > 0 && (
          <div id={validationId} role={hasError ? 'alert' : 'status'} aria-live={hasError ? 'assertive' : 'polite'} aria-atomic="true">
            {validationItems.map((item, index) => <p key={index} className={`validation-note ${item.severity} ${item.type === 'far_outside_expected_range' ? 'extreme' : ''}`}>{item.message}</p>)}
          </div>
        )}
      </div>
    );
  }

  function renderPostcranialBoard() {
    const regions = new Map<string, VariableMetadata[]>(visibleGroups.map(([region, records]) => [region, records] as [string, VariableMetadata[]]));
    const preferredOrder = POSTCRANIAL_REGION_ORDER.filter((region) => regions.has(region));
    const preferredRegionNames = new Set<string>(preferredOrder);
    const remainingRegions = visibleGroups.map(([region]) => region).filter((region) => !preferredRegionNames.has(region));
    const orderedRegions = [...preferredOrder, ...remainingRegions];

    return (
      <section className="panel measurement-section postcranial-measurement-section">
        <div className="section-title-row postcranial-section-title">
          <h3>Postcranial measurements</h3>
        </div>
        <div className="postcranial-region-flow">
          {orderedRegions.map((region) => {
            const records = regions.get(region) ?? [];
            if (!records.length) return null;
            return (
              <section className="postcranial-region-block" key={region} aria-label={`${titleCase(region)} measurements`}>
                <h4>{titleCase(region)}</h4>
                <div className="postcranial-measurement-row">
                  {records.map(renderMeasurementCell)}
                </div>
              </section>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <div className="stack">
      <div className="toolbar sticky-toolbar app-toolbar">
        <button className="secondary" onClick={props.onSelectAllVariables} title={props.classifyCase ? 'Select all entered measurements' : 'Select all available measurements for group-only analysis'}>Use all</button>
        <button className="secondary" onClick={props.onClearSelectedVariables}>Use none</button>
        <button className="danger" onClick={props.onClearMeasurements}>Clear data</button>
        {props.selectionStatus && <div className="measurement-selection-status" role="status">{props.selectionStatus}</div>}
        <div className={`measurement-option-status ${props.checkMeasurementErrors ? 'ok' : 'warning'}`}>
          <span>Check for measurement error: <strong>{props.checkMeasurementErrors ? 'On' : 'Off'}</strong></span>
          {props.showOptionsButton && <button className="mini-button" onClick={props.onOpenOptions}>Options</button>}
        </div>
      </div>
      {props.module === 'postcranial_stature' ? renderPostcranialBoard() : visibleGroups.map(([region, records]) => (
        <section className="panel measurement-section" key={region}>
          <div className="section-title-row">
            <h3>{titleCase(region)}</h3>
          </div>
          <div className="measurement-grid-compact">
            {records.map(renderMeasurementCell)}
          </div>
        </section>
      ))}
    </div>
  );
}

function CompactReferenceGroupPanel(props: {
  interfaceLanguage: InterfaceLanguage;
  analysisOptions: AnalysisOptions;
  selectedGroups: Set<string>;
  onToggleGroup: (groupId: string) => void;
  onApplyPreset: (groupIds: string[]) => void;
  onClearGroups: () => void;
  onOpenExpanded?: () => void;
  module: ModuleId;
}) {
  const selectableGroups = props.analysisOptions.groups.available_groups.filter((group) => group.selectable);
  const grouped = groupBy(selectableGroups, (group) => group.category || 'groups');
  const postcranial = props.module === 'postcranial_stature';
  const displayPractitionerGroupLabels = props.module === 'cranial_international_dfa';
  const referenceCountLabel = translateKey('a11y.reference_count', props.interfaceLanguage);
  return (
    <section className={`panel compact-reference-panel ${props.module === 'cranial_howells_dfa' ? 'compact-reference-panel-howells' : ''}`} aria-label={postcranial ? 'Postcranial DFA reference group selection' : 'Reference group selection'}>
      <div className="compact-reference-header">
        <div>
          <p className="options-kicker">{postcranial ? 'Postcranial DFA setup' : 'Analysis setup'}</p>
          <h3>{postcranial ? 'DFA Reference Groups' : 'Reference Groups'}</h3>
          <p>{props.selectedGroups.size} selected</p>
        </div>
        <div className="compact-reference-actions">
          {props.onOpenExpanded && <button className="secondary compact-action" onClick={props.onOpenExpanded}>Expanded selection</button>}
          <button className="secondary compact-action" onClick={props.onClearGroups}>Clear groups</button>
        </div>
      </div>
      {postcranial && <p className="postcranial-dfa-group-note">These groups apply only to Postcranial DFA. Stature estimation uses the independent Stature group setting.</p>}
      <div className="compact-reference-presets" aria-label="Reference group presets">
        {props.analysisOptions.groups.default_group_sets.map((preset) => (
          <button key={preset.id} className="compact-preset-button" onClick={() => props.onApplyPreset(preset.groups)}>
            {preset.label}
          </button>
        ))}
      </div>
      <div className="compact-reference-categories">
        {Object.entries(grouped).map(([category, groups]) => (
          <div className="compact-reference-category" key={category}>
            <strong>{humanize(category)}</strong>
            <div className="compact-group-row">
              {groups.map((group) => (
                <label key={group.id} className={`compact-group-chip ${props.selectedGroups.has(group.id) ? 'selected' : ''}`}>
                  <input
                    type="checkbox"
                    checked={props.selectedGroups.has(group.id)}
                    onChange={() => props.onToggleGroup(group.id)}
                    aria-label={displayPractitionerGroupLabels
                      ? `${group.label}, ${referenceCountLabel} ${group.reference_count}`
                      : `${group.id}, ${group.label}, ${referenceCountLabel} ${group.reference_count}`}
                  />
                  <span>{displayPractitionerGroupLabels ? group.label : group.id}</span>
                  <small aria-hidden="true">{group.reference_count}</small>
                  <span className="sr-only">{displayPractitionerGroupLabels ? '' : `${group.label}; `}{referenceCountLabel} {group.reference_count}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PostcranialAnalysisPanel(props: {
  selectedVariableCount: number;
  selectedStatureVariableCount: number;
  selectedGroupCount: number;
  minimumGroupCount: number;
  canRunDfa: boolean;
  canRunStature: boolean;
  loading: boolean;
  activeTask: ActiveAnalysisTask;
  statureSelection: StandaloneStatureSelection;
  dfaValidation: ClientValidation;
  statureValidation: ClientValidation;
  onRunDfa: () => void;
  onRunStature: () => void;
  onOpenOptions?: () => void;
}) {
  const dfaBlockedByGroups = props.selectedGroupCount < props.minimumGroupCount;
  const dfaStatus = props.dfaValidation.errors.length
    ? `${props.dfaValidation.errors.length} selected measurement issue(s) must be corrected.`
    : dfaBlockedByGroups
      ? `Select at least ${props.minimumGroupCount} DFA reference groups.`
      : `${props.selectedVariableCount} measurements and ${props.selectedGroupCount} DFA groups ready.`;
  const statureStatus = props.statureValidation.errors.length
    ? `${props.statureValidation.errors.length} selected measurement issue(s) must be corrected.`
    : props.selectedStatureVariableCount < 1
      ? 'Select at least one checked stature-compatible length or height measurement.'
      : `${props.selectedStatureVariableCount} stature-compatible measurement${props.selectedStatureVariableCount === 1 ? '' : 's'} ready. ${props.statureSelection.note}`;
  return (
    <section className="panel postcranial-analysis-panel" aria-labelledby="postcranial-analysis-heading">
      <div className="postcranial-analysis-heading-row">
        <div>
          <h3 id="postcranial-analysis-heading">Choose a postcranial analysis</h3>
        </div>
        {props.onOpenOptions && <button className="secondary compact-action" onClick={props.onOpenOptions}>Review analysis options</button>}
      </div>
      <div className="postcranial-analysis-choice-grid">
        <article className="postcranial-analysis-choice">
          <div>
            <h4>Postcranial DFA</h4>
            <small className={props.canRunDfa ? 'analysis-ready-status' : 'analysis-blocked-status'}>{dfaStatus}</small>
          </div>
          <button className="primary" onClick={props.onRunDfa} disabled={!props.canRunDfa} aria-busy={props.activeTask === 'dfa'}>
            {props.activeTask === 'dfa' ? 'Running DFA…' : 'Run Postcranial DFA'}
          </button>
        </article>
        <article className="postcranial-analysis-choice stature-analysis-choice">
          <div>
            <h4>Stature Estimation</h4>
            <small className={props.canRunStature ? 'analysis-ready-status' : 'analysis-blocked-status'}>{statureStatus}</small>
          </div>
          <button className="primary" onClick={props.onRunStature} disabled={!props.canRunStature} aria-busy={props.activeTask === 'stature'}>
            {props.activeTask === 'stature' ? 'Estimating…' : 'Estimate Stature'}
          </button>
        </article>
      </div>
    </section>
  );
}


function GroupScreen(props: {
  analysisOptions: AnalysisOptions;
  selectedGroups: Set<string>;
  onToggleGroup: (groupId: string) => void;
  onApplyPreset: (groupIds: string[]) => void;
  onClearGroups: () => void;
}) {
  const selectableGroups = props.analysisOptions.groups.available_groups.filter((group) => group.selectable);
  const grouped = groupBy(selectableGroups, (group) => group.category || 'groups');
  return (
    <div className="stack">
      <section className="panel">
        <div className="section-title-row preset-header-row">
          <h3>Comparison set presets</h3>
          <button className="secondary compact-action" onClick={props.onClearGroups}>Clear groups</button>
        </div>
        <div className="preset-grid">
          {props.analysisOptions.groups.default_group_sets.map((preset) => (
            <button key={preset.id} className="preset-card simple-preset" onClick={() => props.onApplyPreset(preset.groups)}>
              <strong>{preset.label}</strong>
            </button>
          ))}
        </div>
      </section>
      {Object.entries(grouped).map(([category, groups]) => (
        <section className="panel" key={category}>
          <div className="section-title-row">
            <h3>{humanize(category)}</h3>
          </div>
          <div className="group-grid">
            {groups.map((group) => (
              <label key={group.id} className={`group-chip ${props.selectedGroups.has(group.id) ? 'selected' : ''}`}>
                <input type="checkbox" checked={props.selectedGroups.has(group.id)} onChange={() => props.onToggleGroup(group.id)} />
                <span>{group.label}</span>
                <small>n={group.reference_count}</small>
              </label>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function FreeModuleTestCaseScreen({ moduleTitle, loading, onRun }: { moduleTitle: string; loading: boolean; onRun: () => void }) {
  return (
    <div className="stack free-demo-workspace">
      <section className="panel free-demo-panel">
        <p className="options-kicker">Fordisc Demo</p>
        <h3>{moduleTitle} Demo Case</h3>
        <p>
          Fordisc Demo runs a built-in Demo Case for the selected module. The measurements, variables,
          reference groups, and analysis settings are fixed.
        </p>
        <div className="free-demo-boundary-grid">
          <div><strong>Available</strong><span>Demo Case, Results, and Graphs</span></div>
          <div><strong>Not available</strong><span>Measurement entry, saved cases, imports, options, and reports</span></div>
        </div>
        <button className="primary free-demo-run-button" onClick={onRun} disabled={loading} aria-busy={loading}>
          {loading ? 'Processing…' : 'Run Demo Case'}
        </button>
      </section>
    </div>
  );
}

function StatureUnitToggle({ value, onChange, compact = false }: { value: StatureUnits; onChange: (value: StatureUnits) => void; compact?: boolean }) {
  return (
    <div className={`stature-unit-control${compact ? ' compact-stature-unit-control' : ''}`}>
      <span className="stature-unit-label">Stature units</span>
      <div className="stature-unit-toggle" role="group" aria-label="Stature display units">
        <button type="button" className={value === 'in' ? 'active' : ''} aria-pressed={value === 'in'} onClick={() => onChange('in')}>Inches</button>
        <button type="button" className={value === 'cm' ? 'active' : ''} aria-pressed={value === 'cm'} onClick={() => onChange('cm')}>Centimeters</button>
      </div>
      <small>Display only; calculations are unchanged.</small>
    </div>
  );
}

function StudentAnalysisSetup(props: {
  analysisOptions: AnalysisOptions;
  selectedGroups: Set<string>;
  onToggleGroup: (groupId: string) => void;
  onApplyPreset: (groupIds: string[]) => void;
  onClearGroups: () => void;
  selectedModule: ModuleId;
  statureLevel: string;
  onStatureLevelChange: (value: string) => void;
  statureReference: StatureReference;
  onStatureReferenceChange: (value: StatureReference) => void;
  statureGroupMode: StatureGroupMode;
  onStatureGroupModeChange: (value: StatureGroupMode) => void;
  statureManualGroup: string;
  onStatureManualGroupChange: (value: string) => void;
  statureSortBy: StatureSortBy;
  onStatureSortByChange: (value: StatureSortBy) => void;
  statureUnits: StatureUnits;
  onStatureUnitsChange: (value: StatureUnits) => void;
  statureBirthyearMin: string;
  onStatureBirthyearMinChange: (value: string) => void;
  statureBirthyearMax: string;
  onStatureBirthyearMaxChange: (value: string) => void;
  statureIncludeBirthyearMissing: boolean;
  onStatureIncludeBirthyearMissingChange: (value: boolean) => void;
  showReferenceGroups?: boolean;
}) {
  const selectableGroups = props.analysisOptions.groups.available_groups.filter((group) => group.selectable);
  const grouped = groupBy(selectableGroups, (group) => group.category || 'groups');
  const showReferenceGroups = props.showReferenceGroups !== false;
  return (
    <section className="panel student-analysis-setup">
      {showReferenceGroups && (<>
      <div className="section-title-row preset-header-row">
        <div>
          <p className="options-kicker">Fordisc Student</p>
          <h3>Analysis Setup</h3>
          <p className="student-setup-intro">Select the reference groups needed for this analysis. Student analyses use LOOCV, no Stepwise, no transformation, and measurement-error checking.</p>
        </div>
        <button className="secondary compact-action" onClick={props.onClearGroups}>Clear groups</button>
      </div>

      <div className="student-setup-section">
        <h4>Reference group presets</h4>
        <div className="preset-grid student-preset-grid">
          {props.analysisOptions.groups.default_group_sets.map((preset) => (
            <button key={preset.id} className="preset-card simple-preset" onClick={() => props.onApplyPreset(preset.groups)}>
              <strong>{preset.label}</strong>
            </button>
          ))}
        </div>
      </div>

      {Object.entries(grouped).map(([category, groups]) => (
        <div className="student-setup-section" key={category}>
          <h4>{humanize(category)}</h4>
          <div className="group-grid student-group-grid">
            {groups.map((group) => (
              <label key={group.id} className={`group-chip ${props.selectedGroups.has(group.id) ? 'selected' : ''}`}>
                <input type="checkbox" checked={props.selectedGroups.has(group.id)} onChange={() => props.onToggleGroup(group.id)} />
                <span>{group.label}</span>
                <small>n={group.reference_count}</small>
              </label>
            ))}
          </div>
        </div>
      ))}
      </>)}

      {props.selectedModule === 'postcranial_stature' && (
        <div className="student-setup-section student-stature-setup">
          <h4>Stature settings</h4>
          <div className="student-stature-grid">
            <label className="field-label">Reference sample
              <select value={props.statureReference} onChange={(event) => props.onStatureReferenceChange(event.target.value as StatureReference)}>
                {STATURE_REFERENCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="field-label">Prediction interval
              <select value={props.statureLevel} onChange={(event) => props.onStatureLevelChange(event.target.value)}>
                <option value="0.90">90%</option>
                <option value="0.95">95%</option>
                <option value="0.99">99%</option>
              </select>
            </label>
            <label className="field-label">Stature group
              <select value={props.statureGroupMode} onChange={(event) => props.onStatureGroupModeChange(event.target.value as StatureGroupMode)}>
                <option value="any">Any</option>
                <option value="classified">Current top Postcranial DFA group</option>
                <option value="manual">Manually selected group</option>
              </select>
            </label>
            {props.statureGroupMode === 'manual' && (
              <label className="field-label">Manual stature group
                <select value={props.statureManualGroup} onChange={(event) => props.onStatureManualGroupChange(event.target.value)}>
                  {STATURE_GROUP_OPTIONS.map((group) => <option key={group} value={group}>{group}</option>)}
                </select>
              </label>
            )}
            <label className="field-label">Sort estimates by
              <select value={props.statureSortBy} onChange={(event) => props.onStatureSortByChange(event.target.value as StatureSortBy)}>
                <option value="prediction_interval">Prediction interval</option>
                <option value="r_square">R-square</option>
              </select>
            </label>
            <StatureUnitToggle value={props.statureUnits} onChange={props.onStatureUnitsChange} compact />
            <label className="field-label">Minimum birth year
              <input value={props.statureBirthyearMin} onChange={(event) => props.onStatureBirthyearMinChange(event.target.value)} inputMode="numeric" />
            </label>
            <label className="field-label">Maximum birth year
              <input value={props.statureBirthyearMax} onChange={(event) => props.onStatureBirthyearMaxChange(event.target.value)} inputMode="numeric" placeholder="No maximum" />
            </label>
            <label className="checkbox-row student-birthyear-checkbox">
              <input type="checkbox" checked={props.statureIncludeBirthyearMissing} onChange={(event) => props.onStatureIncludeBirthyearMissingChange(event.target.checked)} />
              <span>Include records with missing birth year</span>
            </label>
          </div>
        </div>
      )}
    </section>
  );
}

function OptionsScreen(props: {
  analysisOptions: AnalysisOptions;
  checkMeasurementErrors: boolean;
  onCheckMeasurementErrorsChange: (value: boolean) => void;
  outlierDetectionThreshold: string;
  onOutlierDetectionThresholdChange: (value: string) => void;
  nearestNeighborCount: string;
  onNearestNeighborCountChange: (value: string) => void;
  excludeIdsText: string;
  onExcludeIdsTextChange: (value: string) => void;
  outputSections: OutputSectionSettings;
  onToggleOutputSection: (key: keyof OutputSectionSettings) => void;
  selectedModule: ModuleId;
  statureLevel: string;
  onStatureLevelChange: (value: string) => void;
  statureMaxTerms: string;
  onStatureMaxTermsChange: (value: string) => void;
  statureDisplayRows: string;
  onStatureDisplayRowsChange: (value: string) => void;
  statureBirthyearMin: string;
  onStatureBirthyearMinChange: (value: string) => void;
  statureBirthyearMax: string;
  onStatureBirthyearMaxChange: (value: string) => void;
  statureIncludeBirthyearMissing: boolean;
  onStatureIncludeBirthyearMissingChange: (value: boolean) => void;
  statureReference: StatureReference;
  onStatureReferenceChange: (value: StatureReference) => void;
  statureGroupMode: StatureGroupMode;
  onStatureGroupModeChange: (value: StatureGroupMode) => void;
  statureManualGroup: string;
  onStatureManualGroupChange: (value: string) => void;
  statureSortBy: StatureSortBy;
  onStatureSortByChange: (value: StatureSortBy) => void;
  statureUnits: StatureUnits;
  onStatureUnitsChange: (value: StatureUnits) => void;
  result: AnalyzeResponse | null;
  sortGroupsMode: SortGroupsMode;
  onSortGroupsModeChange: (value: SortGroupsMode) => void;
  transformationMode: TransformationMode;
  onTransformationModeChange: (value: TransformationMode) => void;
  stepwiseMode: StepwiseMode;
  onStepwiseModeChange: (value: StepwiseMode) => void;
  stepwiseMinVariables: string;
  onStepwiseMinVariablesChange: (value: string) => void;
  stepwiseMaxVariables: string;
  onStepwiseMaxVariablesChange: (value: string) => void;
  stepwiseThreshold: string;
  onStepwiseThresholdChange: (value: string) => void;
  stepwiseTurbo: boolean;
  onStepwiseTurboChange: (value: boolean) => void;
  stepwiseWeighting: StepwiseWeighting;
  onStepwiseWeightingChange: (value: StepwiseWeighting) => void;
  classifyOnlyIfTypF: boolean;
  onClassifyOnlyIfTypFChange: (value: boolean) => void;
  classifyOnlyIfTypFThreshold: string;
  onClassifyOnlyIfTypFThresholdChange: (value: string) => void;
  classifyCase: boolean;
  onClassifyCaseChange: (value: boolean) => void;
  classificationRateMode: ClassificationRateMode;
  onClassificationRateModeChange: (value: ClassificationRateMode) => void;
  classificationMatrixMode: ClassificationMatrixMode;
  onClassificationMatrixModeChange: (value: ClassificationMatrixMode) => void;
  typicalityDisplay: TypicalityDisplaySettings;
  onToggleTypicalityDisplay: (key: keyof TypicalityDisplaySettings) => void;
  onOpenImportData: () => void;
}) {
  const nearestNeighborValue = parseIntegerOrDefault(props.nearestNeighborCount, 15);
  return (
    <div className="options-workspace fordics-options-surface">
      <section className="options-hero-panel">
        <div>
          <p className="options-kicker">Analysis settings</p>
          <h3>Analysis Options</h3>
        </div>
      </section>

      <div className="options-command-grid">
        <section className="panel option-panel option-panel-primary">
          <h3>Core analysis</h3>
          <div className="options-form compact-field-stack">
            <label className={`measurement-error-control ${props.checkMeasurementErrors ? 'is-on' : 'is-off'}`}>
              <input type="checkbox" checked={props.checkMeasurementErrors} onChange={(event) => props.onCheckMeasurementErrorsChange(event.target.checked)} />
              <span className="measurement-error-control-copy">
                <strong>Check for measurement error</strong>
                <small>Recommended. Reviews entered values against expected ranges before analysis.</small>
              </span>
              <span className="measurement-error-control-status">{props.checkMeasurementErrors ? 'On' : 'Off'}</span>
            </label>
            <div className="mini-field-grid">
              <label className="field-label">Outlier threshold
                <input className="seven-digit-input" value={props.outlierDetectionThreshold} onChange={(event) => props.onOutlierDetectionThresholdChange(event.target.value)} inputMode="decimal" />
              </label>
              <label className="field-label">Nearest neighbors
                <input className="seven-digit-input" value={props.nearestNeighborCount} onChange={(event) => props.onNearestNeighborCountChange(event.target.value)} inputMode="numeric" />
              </label>
            </div>
            {nearestNeighborValue > 100 && (
              <div className="option-warning-note">
                Large counts make long tables.
              </div>
            )}
          </div>
        </section>

        <section className="panel option-panel option-panel-stature">
          <h3>Stature options</h3>
          <div className="options-grid compact-options-grid">
            <label className="field-label">Reference sample
              <select value={props.statureReference} onChange={(event) => props.onStatureReferenceChange(event.target.value as StatureReference)}>
                {STATURE_REFERENCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <StatureUnitToggle value={props.statureUnits} onChange={props.onStatureUnitsChange} />
            <label className="field-label">Stature group
              <select value={props.statureGroupMode} onChange={(event) => props.onStatureGroupModeChange(event.target.value as StatureGroupMode)}>
                <option value="any">Any</option>
                <option value="classified">Use current top Postcranial DFA group</option>
                <option value="manual">Choose manual group</option>
              </select>
            </label>
            <label className="field-label">Manual group
              <select value={props.statureManualGroup} onChange={(event) => props.onStatureManualGroupChange(event.target.value)} disabled={props.statureGroupMode !== 'manual'}>
                {STATURE_GROUP_OPTIONS.map((group) => <option key={group} value={group}>{group}</option>)}
              </select>
            </label>
            <label className="field-label">Sort stature table
              <select value={props.statureSortBy} onChange={(event) => props.onStatureSortByChange(event.target.value as StatureSortBy)}>
                <option value="prediction_interval">Prediction interval</option>
                <option value="r_square">R²</option>
              </select>
            </label>
            <label className="field-label">Prediction interval
              <select value={props.statureLevel} onChange={(event) => props.onStatureLevelChange(event.target.value)}>
                <option value="0.90">90%</option>
                <option value="0.95">95%</option>
                <option value="0.99">99%</option>
              </select>
            </label>
            <label className="field-label">Maximum measurements per equation
              <input className="seven-digit-input" value={props.statureMaxTerms} onChange={(event) => props.onStatureMaxTermsChange(event.target.value)} inputMode="numeric" />
            </label>
            <label className="field-label">Equations shown
              <input className="seven-digit-input" value={props.statureDisplayRows} onChange={(event) => props.onStatureDisplayRowsChange(event.target.value)} inputMode="numeric" />
            </label>
            <label className="field-label">Minimum birth year
              <input className="seven-digit-input" value={props.statureBirthyearMin} onChange={(event) => props.onStatureBirthyearMinChange(event.target.value)} inputMode="numeric" />
            </label>
            <label className="field-label">Maximum birth year
              <input className="seven-digit-input" value={props.statureBirthyearMax} onChange={(event) => props.onStatureBirthyearMaxChange(event.target.value)} inputMode="numeric" placeholder="blank" />
            </label>
          </div>
          <label className="checkbox-row option-checkbox light compact-checkbox command-checkbox">
            <input type="checkbox" checked={props.statureIncludeBirthyearMissing} onChange={(event) => props.onStatureIncludeBirthyearMissingChange(event.target.checked)} />
            <span>Include reference cases with missing birth year</span>
          </label>
        </section>

        <section className="panel option-panel exclude-option-panel" aria-labelledby="exclude-ids-heading">
          <div className="section-title-row">
            <h3 id="exclude-ids-heading">Exclude IDs</h3>
            <button className="secondary compact-action" onClick={() => props.onExcludeIdsTextChange('')} disabled={!props.excludeIdsText.trim()}>Clear exclusions</button>
          </div>
          <label className="sr-only" htmlFor="exclude-ids-textarea">Reference IDs to exclude</label>
          <textarea
            id="exclude-ids-textarea"
            className="exclude-ids-box"
            value={props.excludeIdsText}
            onChange={(event) => props.onExcludeIdsTextChange(event.target.value)}
            aria-describedby="exclude-ids-instructions"
            placeholder="Enter one ID per line"
          />
          <p id="exclude-ids-instructions" className="helper-text">Enter one reference ID per line.</p>
          <OptionsOutlierExcludeControl result={props.result} excludeIdsText={props.excludeIdsText} onExcludeIdsTextChange={props.onExcludeIdsTextChange} />
        </section>
      </div>

      <section className="panel option-panel display-control-panel">
        <div className="section-title-row">
          <h3>Extended Results display</h3>
        </div>
        <div className="options-grid display-options-grid">
          <DisplayOption label="Group means and standard deviations" checked={props.outputSections.summaryTables} onChange={() => props.onToggleOutputSection('summaryTables')} />
          <DisplayOption label="Variance/correlation matrices" checked={props.outputSections.covarianceTables} onChange={() => props.onToggleOutputSection('covarianceTables')} />
          <DisplayOption label="Canonical results" checked={props.outputSections.canonicalDetails} onChange={() => props.onToggleOutputSection('canonicalDetails')} />
          <DisplayOption label="Classification statistics" checked={props.outputSections.classificationStats} onChange={() => props.onToggleOutputSection('classificationStats')} />
          <DisplayOption label="Mahalanobis matrices" checked={props.outputSections.mahalanobisMatrices} onChange={() => props.onToggleOutputSection('mahalanobisMatrices')} />
          <DisplayOption label="Reference classifications" checked={props.outputSections.referenceClassifications} onChange={() => props.onToggleOutputSection('referenceClassifications')} />
          <DisplayOption label="Nearest neighbors" checked={props.outputSections.nearestNeighbors} onChange={() => props.onToggleOutputSection('nearestNeighbors')} />
          <DisplayOption label="All stature equations" checked={props.outputSections.allStatureEquations} onChange={() => props.onToggleOutputSection('allStatureEquations')} />
        </div>
      </section>

      <section className="panel option-panel fordics-options-expansion-panel">
        <div className="section-title-row">
          <h3>Additional analysis options</h3>
        </div>
        <div className="legacy-option-grid">
          <div className="legacy-option-card active-legacy-option-card">
            <h4>Transformations</h4>
            <label><input type="radio" name="transformation-mode" checked={props.transformationMode === 'none'} onChange={() => props.onTransformationModeChange('none')} /> None</label>
            <label><input type="radio" name="transformation-mode" checked={props.transformationMode === 'log'} onChange={() => props.onTransformationModeChange('log')} /> Log</label>
            <label><input type="radio" name="transformation-mode" checked={props.transformationMode === 'shape'} onChange={() => props.onTransformationModeChange('shape')} /> Shape</label>
          </div>
          <div className="legacy-option-card active-legacy-option-card stepwise-option-card">
            <h4>Stepwise selection</h4>
            <label><input type="radio" name="stepwise-mode" checked={props.stepwiseMode === 'none'} onChange={() => props.onStepwiseModeChange('none')} /> None</label>
            <label><input type="radio" name="stepwise-mode" checked={props.stepwiseMode === 'forward_wilks'} onChange={() => props.onStepwiseModeChange('forward_wilks')} /> Forward Wilks' Λ</label>
            <label><input type="radio" name="stepwise-mode" checked={props.stepwiseMode === 'forward_mean'} onChange={() => props.onStepwiseModeChange('forward_mean')} /> Forward Mean %</label>
            <label><input type="radio" name="stepwise-mode" checked={props.stepwiseMode === 'forward_min'} onChange={() => props.onStepwiseModeChange('forward_min')} /> Forward Minimum %</label>
            <label><input type="radio" name="stepwise-mode" checked={props.stepwiseMode === 'forward_kappa'} onChange={() => props.onStepwiseModeChange('forward_kappa')} /> Forward Cohen's Kappa</label>
            <div className="stepwise-settings-grid">
              <label className="field-label">Min
                <input className="stepwise-short-input" value={props.stepwiseMinVariables} onChange={(event) => props.onStepwiseMinVariablesChange(event.target.value)} inputMode="numeric" />
              </label>
              <label className="field-label">Max
                <input className="stepwise-short-input" value={props.stepwiseMaxVariables} onChange={(event) => props.onStepwiseMaxVariablesChange(event.target.value)} inputMode="numeric" />
              </label>
              <label className="field-label">Step
                <input className="stepwise-step-input" value={props.stepwiseThreshold} onChange={(event) => props.onStepwiseThresholdChange(event.target.value)} inputMode="decimal" />
              </label>
            </div>
            <div className="stepwise-secondary-options">
              <label><input type="radio" name="stepwise-weighting" checked={props.stepwiseWeighting === 'unweighted'} onChange={() => props.onStepwiseWeightingChange('unweighted')} /> Unweighted</label>
              <label><input type="radio" name="stepwise-weighting" checked={props.stepwiseWeighting === 'weighted'} onChange={() => props.onStepwiseWeightingChange('weighted')} /> Weighted</label>
            </div>
            <label className="stepwise-turbo-row"><input type="checkbox" checked={props.stepwiseTurbo} onChange={(event) => props.onStepwiseTurboChange(event.target.checked)} /> Turbo</label>
          </div>
          <div className="legacy-option-card active-legacy-option-card">
            <h4>Sort groups</h4>
            <label><input type="radio" checked={props.sortGroupsMode === 'distance'} onChange={() => props.onSortGroupsModeChange('distance')} /> Distance</label>
            <label><input type="radio" checked={props.sortGroupsMode === 'group_name'} onChange={() => props.onSortGroupsModeChange('group_name')} /> Group name</label>
          </div>
          <div className="legacy-option-card active-legacy-option-card classify-case-option-card">
            <h4>Classify Case</h4>
            <label><input type="checkbox" checked={props.classifyCase} onChange={(event) => props.onClassifyCaseChange(event.target.checked)} /> Classify Case</label>
            <small className="helper-text">Unchecked runs group classification only; selected blank measurements are allowed.</small>
            <h4 className="compact-subheading">Classification Rate Estimation</h4>
            <label><input type="radio" name="classification-rate-mode" checked={props.classificationRateMode === 'loocv'} onChange={() => props.onClassificationRateModeChange('loocv')} /> LOO (Jackknife; 1, N-1)</label>
            <label><input type="radio" name="classification-rate-mode" checked={props.classificationRateMode === 'resubstitution'} onChange={() => props.onClassificationRateModeChange('resubstitution')} /> Resubstitution (N, N)</label>
          </div>
          <div className="legacy-option-card active-legacy-option-card">
            <h4>Classification matrix</h4>
            <label><input type="radio" checked={props.classificationMatrixMode === 'counts'} onChange={() => props.onClassificationMatrixModeChange('counts')} /> Counts</label>
            <label><input type="radio" checked={props.classificationMatrixMode === 'percentages'} onChange={() => props.onClassificationMatrixModeChange('percentages')} /> Percentages</label>
          </div>
          <div className="legacy-option-card active-legacy-option-card">
            <h4>Typicality probabilities</h4>
            <label><input type="checkbox" checked={props.typicalityDisplay.f} onChange={() => props.onToggleTypicalityDisplay('f')} /> Typ. F</label>
            <label><input type="checkbox" checked={props.typicalityDisplay.chi} onChange={() => props.onToggleTypicalityDisplay('chi')} /> Chi-square</label>
            <label><input type="checkbox" checked={props.typicalityDisplay.ranked} onChange={() => props.onToggleTypicalityDisplay('ranked')} /> Ranked</label>
          </div>
          <div className="legacy-option-card active-legacy-option-card classify-typf-option-card">
            <h4>Classification safeguard</h4>
            <label><input type="checkbox" checked={props.classifyOnlyIfTypF} onChange={(event) => props.onClassifyOnlyIfTypFChange(event.target.checked)} /> Classify only if Typ. F &gt;</label>
            <label className="field-label">Threshold
              <input className="stepwise-step-input" value={props.classifyOnlyIfTypFThreshold} onChange={(event) => props.onClassifyOnlyIfTypFThresholdChange(event.target.value)} inputMode="decimal" />
            </label>
          </div>
        </div>
      </section>

    </div>
  );
}


function ImportDataScreen(props: {
  variables: VariableMetadata[];
  selectedModule: ModuleId;
  selectedModuleTitle: string;
  importPreview: ImportPreview | null;
  onImportPreviewChange: (preview: ImportPreview | null) => void;
  onApplyFirstRow: (caseUpdates: Record<string, string>, variablesToInclude: string[]) => void;
  onCloseImportData: () => void;
  useCustomReferenceAnalysis: boolean;
  onUseCustomReferenceAnalysisChange: (value: boolean) => void;
}) {
  const [status, setStatus] = useState('');
  const variableLookup = useMemo(() => buildVariableLookup(props.variables), [props.variables]);

  async function buildImportLookup() {
    try {
      const modulesToLoad: ModuleId[] = ['cranial_fdb_dfa', 'cranial_howells_dfa', 'cranial_international_dfa', 'postcranial_stature'];
      const responses = await Promise.all(modulesToLoad.map((moduleId) => apiGet<{ variables: VariableMetadata[] }>(`/metadata/variables?module=${moduleId}`)));
      return buildVariableLookup(responses.flatMap((response) => response.variables));
    } catch {
      return variableLookup;
    }
  }

  async function handleFile(file: File | null) {
    setStatus('');
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (['dbf', 'db', 'adt'].includes(ext)) {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const buffer = reader.result instanceof ArrayBuffer ? reader.result : new ArrayBuffer(0);
          const parsed = ext === 'adt' ? parseAdvantageTable(buffer) : parseDbaseTable(buffer);
          if (isLegacyFd3CaseTable(parsed.headers, parsed.rows)) {
            props.onImportPreviewChange(buildUnsupportedImportPreview(file.name, ext.toUpperCase(), [
              'This looks like an FD3 saved case file. Use Open FD3 Case at the top of the app instead of Import Data.',
              'Import Data is for custom reference datasets with multiple reference rows.'
            ]));
            return;
          }
          const importLookup = await buildImportLookup();
          const preview = buildImportPreview(file.name, ext, ext === 'adt' ? 'adt' : 'dbf', parsed.headers, parsed.rows, importLookup, [
            ext === 'adt'
              ? 'Legacy ADT table imported. Review the detected ID field, reference group field, matched measurement columns, and diagnostics before analysis.'
              : ext === 'dbf'
                ? 'Legacy DBF table imported. Review the detected ID field, reference group field, and matched measurement columns before analysis.'
                : 'Legacy .DB table imported using the dBase/DBF reader. Review the preview carefully before analysis.'
          ]);
          props.onImportPreviewChange(preview);
        } catch (error) {
          props.onImportPreviewChange(buildUnsupportedImportPreview(file.name, ext.toUpperCase(), [
            ext === 'adt'
              ? 'This ADT file could not be read by the current direct ADT import path. Some Advantage tables may be encrypted, indexed-only, or require companion metadata files. Export the table from FD3 or Advantage as DBF, CSV, or TXT and import that file.'
              : `This ${ext.toUpperCase()} file could not be read by the current dBase/DBF import path. If it is an Advantage/ADT database, export the table from FD3 or Advantage as DBF, CSV, or TXT and import that file.`,
            error instanceof Error ? error.message : 'The file structure was not recognized.'
          ]));
        }
      };
      reader.onerror = () => setStatus('Legacy database file could not be read.');
      reader.readAsArrayBuffer(file);
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const text = String(reader.result ?? '');
      const delimiter = detectDelimiter(text, file.name);
      const parsed = parseDelimitedText(text, delimiter);
      if (!parsed.headers.length) {
        props.onImportPreviewChange({
          fileName: file.name,
          fileType: ext.toUpperCase() || 'TEXT',
          delimiter: delimiter === '\t' ? 'tab' : 'comma',
          headers: [],
          rows: [],
          idColumn: null,
          groupColumn: null,
          groupMode: null,
          matchedMeasurementColumns: [],
          ignoredColumns: [],
          warnings: ['No header row could be read from this file.'],
          unsupported: false
        });
        return;
      }
      if (isLegacyFd3CaseTable(parsed.headers, parsed.rows)) {
        props.onImportPreviewChange(buildUnsupportedImportPreview(file.name, ext.toUpperCase() || 'TEXT', [
          'This looks like an FD3 saved case file. Use Open FD3 Case at the top of the app instead of Import Data.',
          'Import Data is for custom reference datasets with multiple reference rows.'
        ]));
        return;
      }
      const importLookup = await buildImportLookup();
      props.onImportPreviewChange(buildImportPreview(file.name, ext, delimiter, parsed.headers, parsed.rows, importLookup));
    };
    reader.onerror = () => setStatus('File could not be read.');
    reader.readAsText(file);
  }

  function applyFirstRow() {
    const preview = props.importPreview;
    const first = preview?.rows?.[0];
    if (!preview || !first) return;
    const updates: Record<string, string> = {};
    const include: string[] = [];
    for (const match of preview.matchedMeasurementColumns) {
      const value = String(first[match.header] ?? '').trim();
      if (value !== '' && isFinite(Number(value))) {
        updates[match.variable] = value;
        include.push(match.variable);
      }
    }
    props.onApplyFirstRow(updates, include);
  }

  return (
    <div className="stack import-data-workspace">
      <section className="panel import-command-panel">
        <div>
          <p className="eyebrow">Custom reference data</p>
          <h3>Import Data</h3>
          
        </div>
        <div className="import-actions">
          <label className="primary file-button">Choose CSV / TXT / DBF / ADT
            <input type="file" accept=".csv,.tsv,.txt,.adt,.dbf,.db" onChange={(event) => handleFile(event.target.files?.[0] ?? null)} />
          </label>
          <button className="secondary" onClick={() => downloadImportTemplate('cranial')}>Download cranial template</button>
          <button className="secondary" onClick={() => downloadImportTemplate('postcranial')}>Download postcranial template</button>
          <button className="secondary" onClick={props.onCloseImportData}>Close Import Data</button>
        </div>
        {status && <p className="action-status">{status}</p>}
      </section>

      {props.importPreview && (
        <section className={`panel import-preview-panel ${props.importPreview.unsupported ? 'unsupported-import' : ''}`}>
          <div className="section-title-row">
            <h3>{props.importPreview.fileName}</h3>
            <button className="secondary compact-action" onClick={() => props.onImportPreviewChange(null)}>Clear import</button>
          </div>
          <div className="import-summary-grid">
            <div><span>Rows</span><strong>{props.importPreview.rows.length}</strong></div>
            <div><span>Columns</span><strong>{props.importPreview.headers.length}</strong></div>
            <div><span>ID column</span><strong>{props.importPreview.idColumn ?? 'Not found'}</strong></div>
            <div><span>Reference group field</span><strong>{describeImportGroupMode(props.importPreview)}</strong></div>
            <div><span>Matched measurements</span><strong>{props.importPreview.matchedMeasurementColumns.length}</strong></div>
            <div><span>Ignored columns</span><strong>{props.importPreview.ignoredColumns.length}</strong></div>
          </div>
          {!props.importPreview.unsupported && (
            <ImportGroupFieldSelector preview={props.importPreview} onChange={(mode) => props.onImportPreviewChange(updateImportGroupMode(props.importPreview!, mode))} />
          )}
          {props.importPreview.warnings.length > 0 && (
            <div className="warning-panel compact-warning-panel">
              <h3>Import warnings</h3>
              <ul>{props.importPreview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
            </div>
          )}
          {!props.importPreview.unsupported && (
            <>
              <ImportColumnSummary preview={props.importPreview} />
              <ImportCustomReferenceReadiness preview={props.importPreview} />
              <ImportGroupDiagnostics preview={props.importPreview} />
              <ImportMissingnessDiagnostics preview={props.importPreview} />
              <label className="checkbox-row option-checkbox light custom-reference-toggle">
                <input type="checkbox" checked={props.useCustomReferenceAnalysis} onChange={(event) => props.onUseCustomReferenceAnalysisChange(event.target.checked)} />
                <span>Use imported reference dataset for Run Analysis</span>
              </label>
            </>
          )}
          {!props.importPreview.unsupported && props.importPreview.matchedMeasurementColumns.length > 0 && props.importPreview.rows.length > 0 && (
            <div className="import-apply-row">
              <button className="primary" onClick={applyFirstRow}>Apply first row as Case</button>
              <span>Copies matched measurement values from row 1 into the active case and selects those variables.</span>
            </div>
          )}
        </section>
      )}

      {props.importPreview && !props.importPreview.unsupported && props.importPreview.rows.length > 0 && (
        <section className="panel table-panel">
          <div className="section-title-row"><h3>Preview</h3></div>
          <div className="scroll-table import-preview-table">
            <table>
              <caption className="sr-only">Imported data preview</caption>
              <thead>
                <tr>{props.importPreview.headers.slice(0, 16).map((header) => <th scope="col" key={header}>{header}</th>)}</tr>
              </thead>
              <tbody>
                {props.importPreview.rows.slice(0, 10).map((row, index) => (
                  <tr key={index}>{props.importPreview!.headers.slice(0, 16).map((header, columnIndex) => columnIndex === 0 ? <th scope="row" key={header}>{row[header] ?? ''}</th> : <td key={header}>{row[header] ?? ''}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function ImportGroupFieldSelector({ preview, onChange }: { preview: ImportPreview; onChange: (mode: string) => void }) {
  const options = getImportGroupFieldOptions(preview);
  if (!options.length) return null;
  const current = preview.groupMode || options[0].value;
  return (
    <div className="import-group-selector">
      <label className="field-label">Reference group field
        <select value={current} onChange={(event) => onChange(event.target.value)}>
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <p className="helper-text">Choose the field that defines the reference groups for custom-reference DFA. If Pop and Sex are present, FORDISC can derive sex-specific groups such as JF/JM.</p>
    </div>
  );
}

function ImportCustomReferenceReadiness({ preview }: { preview: ImportPreview }) {
  const ready = Boolean(preview.idColumn && preview.groupMode && preview.matchedMeasurementColumns.length >= 2 && preview.rows.length > 1);
  return (
    <div className={`import-readiness-panel ${ready ? 'ready' : 'not-ready'}`}>
      <div>
        <h4>Custom reference data readiness</h4>
        <p className="helper-text">Session reference dataset is {ready ? 'structurally ready for custom-reference DFA. When you run analysis, the case will be compared only to this imported reference dataset.' : 'not ready yet. ID, reference group field, rows, and at least two matched measurements are needed.'}</p>
      </div>
      <div className="import-readiness-grid">
        <span>ID: <strong>{preview.idColumn ?? 'Missing'}</strong></span>
        <span>Reference group field: <strong>{describeImportGroupMode(preview)}</strong></span>
        <span>Measurements: <strong>{preview.matchedMeasurementColumns.length}</strong></span>
        <span>Rows: <strong>{preview.rows.length}</strong></span>
      </div>
    </div>
  );
}

function ImportGroupDiagnostics({ preview }: { preview: ImportPreview }) {
  const groupRows = importGroupDiagnosticRows(preview);
  if (!groupRows.length) return null;
  return (
    <div className="import-group-diagnostics">
      <div className="section-title-row simple-title-row">
        <h4>Detected reference groups</h4>
      </div>
      <p className="helper-text">These are the groups produced by the selected Reference group field before complete-case filtering. Missingness for selected measurements may reduce the usable groups during analysis.</p>
      <div className="import-group-diagnostic-grid">
        {groupRows.slice(0, 36).map((row) => (
          <span key={row.group} className="import-group-count-chip"><strong>{row.group}</strong>{row.count}</span>
        ))}
        {groupRows.length > 36 && <span className="import-group-count-chip muted-count-chip"><strong>+{groupRows.length - 36}</strong>more</span>}
      </div>
    </div>
  );
}

function ImportMissingnessDiagnostics({ preview }: { preview: ImportPreview }) {
  const rows = importVariableMissingnessImpactRows(preview);
  if (!rows.length) return null;
  return (
    <div className="import-missingness-diagnostics">
      <div className="section-title-row simple-title-row">
        <h4>Measurement missingness impact</h4>
      </div>
      <p className="helper-text">These variables most reduce the number of usable reference groups for the currently selected grouping field. Removing one of these measurements may increase the number of groups available for custom-reference DFA.</p>
      <div className="missingness-impact-table">
        <table>
          <caption className="sr-only">Measurement missingness impact</caption>
          <thead><tr><th scope="col">Variable</th><th scope="col">Missing cells</th><th scope="col">Usable groups if omitted</th><th scope="col">Groups gained</th></tr></thead>
          <tbody>
            {rows.slice(0, 12).map((row) => (
              <tr key={row.variable} className={row.groupsGained > 0 ? 'impact-positive-row' : ''}>
                <th scope="row">{row.variable}</th>
                <td>{row.missingCells}</td>
                <td>{row.usableGroupsIfOmitted}</td>
                <td>{row.groupsGained > 0 ? `+${row.groupsGained}` : '0'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ImportColumnSummary({ preview }: { preview: ImportPreview }) {
  const matched = preview.matchedMeasurementColumns.slice(0, 48);
  const ignoredExamples = preview.ignoredColumns.slice(0, 10);
  return (
    <div className="import-column-summary">
      <div>
        <h4>Matched measurement columns</h4>
        {matched.length ? (
          <div className="import-chip-list">
            {matched.map((match) => <span key={`${match.header}-${match.variable}`} className="import-chip matched-chip">{match.header} → {match.variable}</span>)}
          </div>
        ) : <p className="helper-text">No active Fordisc measurement columns matched this file.</p>}
      </div>
      <div>
        <h4>Ignored nonmatching columns</h4>
        <p className="helper-text">{preview.ignoredColumns.length} column(s) will be ignored. These are not passed into analysis.</p>
        {ignoredExamples.length > 0 && (
          <div className="import-chip-list muted-chip-list">
            {ignoredExamples.map((column) => <span key={column} className="import-chip ignored-chip">{column}</span>)}
            {preview.ignoredColumns.length > ignoredExamples.length && <span className="import-chip ignored-chip">+{preview.ignoredColumns.length - ignoredExamples.length} more</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function DisplayOption({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="checkbox-row option-checkbox light display-option">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span>{label}</span>
    </label>
  );
}

function OptionsOutlierExcludeControl({ result, excludeIdsText, onExcludeIdsTextChange }: { result: AnalyzeResponse | null; excludeIdsText: string; onExcludeIdsTextChange: (value: string) => void }) {
  const [feedback, setFeedback] = useState('');
  const [appliedIdsKey, setAppliedIdsKey] = useState('');
  const rows = result?.result?.extended_results?.outliers?.detected;
  const ids = Array.isArray(rows) ? extractOutlierIds(rows) : [];
  const idsKey = ids.join('|');
  const existingIds = new Set(parseExcludeIds(excludeIdsText));
  const alreadyListed = ids.length > 0 && ids.every((id) => existingIds.has(id));
  const actionComplete = ids.length > 0 && (alreadyListed || appliedIdsKey === idsKey);
  useEffect(() => {
    if (appliedIdsKey && appliedIdsKey !== idsKey) {
      setAppliedIdsKey('');
      setFeedback('');
    }
  }, [appliedIdsKey, idsKey]);
  if (!ids.length) return null;
  const addIds = () => {
    const merged = mergeExcludeIds(excludeIdsText, ids);
    onExcludeIdsTextChange(merged.text);
    setAppliedIdsKey(idsKey);
    setFeedback(merged.addedCount > 0 ? `Outlier IDs added to Exclude IDs. Re-run analysis to apply the exclusion.` : 'Outlier IDs are already listed. Re-run analysis to apply the exclusion.');
  };
  return (
    <div className="option-inline-action">
      {actionComplete ? (
        <span className="action-status action-status-complete">{feedback || 'Outlier IDs are listed in Exclude IDs. Re-run analysis to apply the exclusion.'}</span>
      ) : (
        <button className="secondary" onClick={addIds}>Add detected outliers</button>
      )}
    </div>
  );
}

function ResultsPageContent(props: {
  result: AnalyzeResponse;
  showOutlierActions: boolean;
  resultIsStale: boolean;
  excludeIdsText: string;
  onExcludeIdsTextChange: (value: string) => void;
  sortGroupsMode: SortGroupsMode;
  classificationMatrixMode: ClassificationMatrixMode;
  typicalityDisplay: TypicalityDisplaySettings;
  statureUnits: StatureUnits;
  embedded?: boolean;
}) {
  const result = props.result.result;
  const classification = result.classification;
  const topRelationship = Array.isArray(result.relationship) ? result.relationship[0] : null;
  const best = result.best_estimate;
  const variablesUsed = Array.isArray(result.variables_used) ? result.variables_used : [];
  const wideGroupResults = analysisGroupCount(props.result) > WIDE_TABLE_GROUP_THRESHOLD;
  return (
    <div className={`stack results-screen-stack${props.embedded ? ' run-log-results-snapshot' : ''}${wideGroupResults ? ' wide-group-results' : ''}`}>
      {props.resultIsStale && (
        <section className="warning-panel stale-panel">
          <h3>Results may be out of date</h3>
          <p>Measurements, selected variables, or reference groups changed after the last run. Run the analysis again before interpreting or exporting these results.</p>
        </section>
      )}
      <Warnings result={result} />
      {props.showOutlierActions && <ResultsOutlierAction result={result} excludeIdsText={props.excludeIdsText} onExcludeIdsTextChange={props.onExcludeIdsTextChange} />}
      {classification ? (
        <section className="summary-grid results-summary-grid">
          {classification.case_classified === false ? (
            <div className="metric-card primary-metric"><span>Classification mode</span><strong>Group-only</strong><small>Classify Case is off</small></div>
          ) : (
            <>
              <div className="metric-card primary-metric"><span>Predicted group</span><strong>{classification.predicted_group}</strong>{result.classification_safeguard?.triggered && <small>{`Original: ${result.classification_safeguard.original_predicted_group ?? '—'}`}</small>}</div>
              <div className="metric-card"><span>Posterior probability</span><strong>{topRelationship ? formatProbability(topRelationship.posterior_probability) : '—'}</strong></div>
              {props.typicalityDisplay.chi && <div className="metric-card"><span>Typ. χ²</span><strong>{topRelationship ? formatProbability(topRelationship.typicality_chi_square) : '—'}</strong></div>}
              {props.typicalityDisplay.f && <div className="metric-card"><span>Typ. F</span><strong>{topRelationship ? formatProbability(topRelationship.typicality_f) : '—'}</strong></div>}
            </>
          )}
          <div className="metric-card"><span>{classificationRateLabel(classification.rate_estimation?.method ?? result.classification_rate_estimation)} accuracy</span><strong>{classification.total_correct?.percent?.toFixed?.(1) ?? '—'}%</strong><small>{classification.total_correct ? `${classification.total_correct.correct}/${classification.total_correct.total}` : classification.rate_estimation?.label ?? 'classification rate'}</small></div>
          {result.custom_reference && <div className="metric-card"><span>Reference source</span><strong>Custom</strong><small>{result.custom_reference.row_count ? `${result.custom_reference.row_count} reference rows` : 'Imported reference data'}</small></div>}
          {result.transformation && result.transformation !== 'none' && <div className="metric-card"><span>Transformation</span><strong>{String(result.transformation).toUpperCase()}</strong><small>DFA values transformed before analysis</small></div>}
          {result.stepwise?.active && <div className="metric-card"><span>Stepwise selection</span><strong>{result.stepwise.selected_variable_count ?? variablesUsed.length} variables</strong><small>{result.stepwise.label ?? 'FD3-style forward selection'}</small></div>}
        </section>
      ) : null}
      {best && (
        <section className="summary-grid results-summary-grid stature-summary-grid">
          <div className="metric-card primary-metric"><span>Best stature estimate</span><strong>{formatStatureCell('Point_Est', best?.Point_Est, props.statureUnits)} {statureUnitAbbreviation(props.statureUnits)}</strong><small>{best?.Measurement ?? 'No equation selected'}</small></div>
          <div className="metric-card"><span>Prediction interval</span><strong>{best ? `${formatStatureCell('L', best.L, props.statureUnits)}–${formatStatureCell('U', best.U, props.statureUnits)} ${statureUnitAbbreviation(props.statureUnits)}` : '—'}</strong><small>{best?.PI ? `PI width ${formatStatureCell('PI', best.PI, props.statureUnits)} ${statureUnitAbbreviation(props.statureUnits)}` : 'Interval limits'}</small></div>
          <div className="metric-card"><span>Equation value</span><strong>{formatStatureCell('Value', best?.Value, props.statureUnits)}</strong><small>Measurement sum used by best equation</small></div>
          <div className="metric-card"><span>Equations evaluated</span><strong>{result.stature_result_count ?? result.result_count ?? '—'}</strong><small>{result.stature_displayed_count ?? result.displayed_count ?? '—'} displayed in Results</small></div>
          <div className="metric-card"><span>Stature reference</span><strong>{result.stature_options?.stature_reference_label ?? '20th C FStats'}</strong><small>{Array.isArray(result.stature_options?.resolved_groups) ? `Group: ${result.stature_options.resolved_groups.join(', ')}` : 'Group: Any'}</small></div>
        </section>
      )}
      {classification && <ResultsDiagnostics result={result} classificationMatrixMode={props.classificationMatrixMode} />}
      {Array.isArray(result.relationship) && result.relationship.length > 0 && <RelationshipTable rows={result.relationship} sortGroupsMode={props.sortGroupsMode} typicalityDisplay={props.typicalityDisplay} />}
      {Array.isArray(result.top_results) && <GenericTable title="Top Stature Estimates" rows={result.top_results.slice(0, 25)} statureUnits={props.statureUnits} />}
    </div>
  );
}

function ResultsScreen(props: {
  result: AnalyzeResponse | null;
  apiError: Record<string, any> | null;
  onRun: () => void;
  loading: boolean;
  activeTask: ActiveAnalysisTask;
  canRun: boolean;
  validation: ClientValidation;
  postcranialActions?: {
    onRunDfa: () => void;
    onRunStature: () => void;
    canRunDfa: boolean;
    canRunStature: boolean;
    statureValidation: ClientValidation;
    statureSelection: StandaloneStatureSelection;
    selectedVariableCount: number;
    selectedStatureVariableCount: number;
    selectedGroupCount: number;
    minimumGroupCount: number;
    onOpenOptions?: () => void;
  };
  onOpenMeasurements?: () => void;
  onOpenGroups?: () => void;
  groupActionLabel?: string;
  showOutlierActions: boolean;
  resultIsStale: boolean;
  lastRunAt: string | null;
  checkMeasurementErrors: boolean;
  excludeIdsText: string;
  onExcludeIdsTextChange: (value: string) => void;
  sortGroupsMode: SortGroupsMode;
  classificationMatrixMode: ClassificationMatrixMode;
  typicalityDisplay: TypicalityDisplaySettings;
  statureUnits: StatureUnits;
  classifyCase: boolean;
}) {
  if (props.apiError) return <ApiErrorPanel error={props.apiError} onOpenMeasurements={props.onOpenMeasurements} onOpenGroups={props.onOpenGroups} />;
  if (!props.result) {
    if (props.postcranialActions) {
      return (
        <div className="stack">
          <PostcranialAnalysisPanel
            selectedVariableCount={props.postcranialActions.selectedVariableCount}
            selectedStatureVariableCount={props.postcranialActions.selectedStatureVariableCount}
            selectedGroupCount={props.postcranialActions.selectedGroupCount}
            minimumGroupCount={props.postcranialActions.minimumGroupCount}
            canRunDfa={props.postcranialActions.canRunDfa}
            canRunStature={props.postcranialActions.canRunStature}
            loading={props.loading}
            activeTask={props.activeTask}
            statureSelection={props.postcranialActions.statureSelection}
            dfaValidation={props.validation}
            statureValidation={props.postcranialActions.statureValidation}
            onRunDfa={props.postcranialActions.onRunDfa}
            onRunStature={props.postcranialActions.onRunStature}
            onOpenOptions={props.postcranialActions.onOpenOptions}
          />
          {props.onOpenMeasurements && <div className="toolbar"><button className="secondary" onClick={props.onOpenMeasurements}>Measurements</button></div>}
        </div>
      );
    }
    return (
      <div className="stack">
        <RunReadinessPanel validation={props.validation} canRun={props.canRun} loading={props.loading} activeTask={props.activeTask} onRun={props.onRun} onOpenMeasurements={props.onOpenMeasurements} onOpenGroups={props.onOpenGroups} groupActionLabel={props.groupActionLabel} checkMeasurementErrors={props.checkMeasurementErrors} classifyCase={props.classifyCase} />
      </div>
    );
  }
  return (
    <ResultsPageContent
      result={props.result}
      showOutlierActions={props.showOutlierActions}
      resultIsStale={props.resultIsStale}
      excludeIdsText={props.excludeIdsText}
      onExcludeIdsTextChange={props.onExcludeIdsTextChange}
      sortGroupsMode={props.sortGroupsMode}
      classificationMatrixMode={props.classificationMatrixMode}
      typicalityDisplay={props.typicalityDisplay}
      statureUnits={props.statureUnits}
    />
  );
}

function RunReadinessPanel(props: { validation: ClientValidation; canRun: boolean; loading: boolean; activeTask: ActiveAnalysisTask; onRun: () => void; onOpenMeasurements?: () => void; onOpenGroups?: () => void; groupActionLabel?: string; checkMeasurementErrors: boolean; classifyCase: boolean }) {
  return (
    <section className="panel run-panel">
      <h3>No results yet</h3>
      <p>{props.classifyCase ? 'Enter measurements, select reference groups, then run the analysis.' : 'Select variables and reference groups, then run group classification.'}</p>
      {!props.checkMeasurementErrors && (
        <div className="measurement-check-skipped-alert">
          <strong>Check for measurement error is off.</strong>
          <span> Measurement range checking will be skipped for this analysis.</span>
        </div>
      )}
      {props.validation.errors.length > 0 && (
        <div className="blocking-validation-alert">
          <h4>Measurement check requires review</h4>
          <ul>
            {props.validation.errors.slice(0, 6).map((error, index) => <li key={index}><strong>{error.variable}</strong>: {error.message}</li>)}
          </ul>
          {props.validation.errors.length > 6 && <p>{props.validation.errors.length - 6} additional issue(s).</p>}
        </div>
      )}
      <div className="toolbar">
        <button className="primary" onClick={props.onRun} disabled={!props.canRun}>{props.activeTask === 'dfa' ? 'Processing…' : 'Run Analysis'}</button>
        {props.onOpenMeasurements && <button className="secondary" onClick={props.onOpenMeasurements}>Measurements</button>}
        {props.onOpenGroups && <button className="secondary" onClick={props.onOpenGroups}>{props.groupActionLabel ?? 'Groups'}</button>}
      </div>
    </section>
  );
}


function ContextItem({ label, value }: { label: string; value: string }) {
  return <div className="context-item"><span>{label}</span><strong>{value}</strong></div>;
}


function ResultsOutlierAction({ result, excludeIdsText, onExcludeIdsTextChange }: { result: Record<string, any>; excludeIdsText: string; onExcludeIdsTextChange: (value: string) => void }) {
  const detectedRows = result.extended_results?.outliers?.detected;
  const rows = Array.isArray(detectedRows) ? cleanOutlierRows(detectedRows) : [];
  if (!rows.length) return null;
  return <OutlierIdsControl rows={rows} excludeIdsText={excludeIdsText} onExcludeIdsTextChange={onExcludeIdsTextChange} />;
}

function ResultsOutlierDetection({ result, excludeIdsText, onExcludeIdsTextChange }: { result: Record<string, any>; excludeIdsText: string; onExcludeIdsTextChange: (value: string) => void }) {
  const outlierSummary = result.outliers ?? result.extended_results?.outliers;
  const detectedRows = result.extended_results?.outliers?.detected;
  const rows = Array.isArray(detectedRows) ? cleanOutlierRows(detectedRows) : [];
  const detectedCount = outlierSummary?.detected_count ?? rows.length;
  const excludedCount = outlierSummary?.excluded_count ?? 0;
  const threshold = outlierSummary?.detection_threshold ?? result.extended_results?.outliers?.detection_threshold ?? 0.005;
  if (!outlierSummary && !rows.length) return null;
  return (
    <section className="panel results-outlier-panel">
      <div className="section-title-row">
        <div>
          <h3>Reference Outlier Detection</h3>
          
        </div>
        <span className="outlier-compact-count">{detectedCount ?? 0} detected / {excludedCount} excluded</span>
      </div>
      <div className="context-grid diagnostic-grid outlier-result-grid">
        <ContextItem label="Detection threshold" value={`F Typ p <= ${formatProbability(threshold)}`} />
        <ContextItem label="Detected" value={String(detectedCount ?? 0)} />
        <ContextItem label="Excluded" value={String(excludedCount)} />
      </div>
      {outlierSummary?.warning && <p className="outlier-inline-warning">{outlierSummary.warning}</p>}
      {rows.length > 0 && <OutlierIdsControl rows={rows} excludeIdsText={excludeIdsText} onExcludeIdsTextChange={onExcludeIdsTextChange} />}
      {rows.length > 0 && <GenericTable title={`Reference Outliers at F Typ p <= ${formatProbability(threshold)}`} rows={rows} />}
    </section>
  );
}

function ResultsDiagnostics({ result, classificationMatrixMode }: { result: Record<string, any>; classificationMatrixMode: ClassificationMatrixMode }) {
  const measurementChecks = Array.isArray(result.measurement_checks) ? result.measurement_checks : [];
  const classificationBlock = result.extended_results?.classification;
  const matrix = classificationBlock?.fd3_table ?? classificationBlock?.table;
  const lnDet = result.model_summary?.ln_vcvm_determinant;
  const totalCorrect = result.classification?.total_correct;
  const hasOutliers = Boolean(result.outliers ?? result.extended_results?.outliers);
  if (!measurementChecks.length && !Array.isArray(matrix) && !hasOutliers && lnDet === undefined && !totalCorrect) return null;
  return (
    <section className="panel results-diagnostics-panel analysis-checks-panel">
      <div className="section-title-row simple-title-row">
        <h3>Analysis Checks</h3>
      </div>
      <div className="context-grid diagnostic-grid">
        <ContextItem label="Measurement checks" value={measurementChecks.length ? `${measurementChecks.length} variables checked` : 'Not available'} />
        <ContextItem label="Reference outliers" value={formatOutlierSummary(result.outliers)} />
        <ContextItem label="ln VCVM determinant" value={formatNumber(lnDet)} />
        <ContextItem label={`${classificationRateLabel(result.classification?.rate_estimation?.method)} accuracy`} value={totalCorrect?.percent !== undefined ? `${formatNumber(totalCorrect.percent)}% (${totalCorrect.correct}/${totalCorrect.total})` : '—'} />
      </div>
      {measurementChecks.length > 0 && <MeasurementChecksTable rows={measurementChecks.slice(0, 25)} />}
      {Array.isArray(matrix) && <ClassificationMatrixTable classification={classificationBlock} mode={classificationMatrixMode} rateMethod={result.classification?.rate_estimation} />}
    </section>
  );
}

function customReferenceSummaryRows(result: AnalyzeResponse | null) {
  const custom = result?.result?.custom_reference;
  if (!custom) return [] as Array<Record<string, any>>;
  return [{
    source: custom.reference_label || custom.source || 'Imported reference data',
    rows: custom.row_count ?? '—',
    group_field: custom.group_column ?? '—',
    id_field: custom.id_column ?? '—',
    groups: Array.isArray(custom.groups) ? custom.groups.join(', ') : '—',
    variables_used: Array.isArray(custom.variables_used) ? custom.variables_used.join(', ') : '—'
  }];
}

function ExtendedResultsScreen({ result, excludeIdsText, onExcludeIdsTextChange, outputSections, classificationMatrixMode, typicalityDisplay, statureUnits }: { result: AnalyzeResponse | null; excludeIdsText: string; onExcludeIdsTextChange: (value: string) => void; outputSections: OutputSectionSettings; classificationMatrixMode: ClassificationMatrixMode; typicalityDisplay: TypicalityDisplaySettings; statureUnits: StatureUnits }) {
  const extended = result?.result?.extended_results;
  if (!result) return <EmptyPanel title="No analysis has been run" message="Run an analysis to populate Extended Results." />;
  if (!extended) return <EmptyPanel title="Extended Results unavailable" message="This response does not include extended data." />;
  const neighbors = Array.isArray(extended.nearest_neighbors) ? extended.nearest_neighbors : [];
  const hasOutlierDetails = Boolean(extended.outliers && Array.isArray(extended.outliers.detected));
  const customReferenceRows = customReferenceSummaryRows(result);
  return (
    <div className={`stack extended-results-stack${analysisGroupCount(result) > WIDE_TABLE_GROUP_THRESHOLD ? ' wide-group-results' : ''}`}>
      {customReferenceRows.length > 0 && (
        <ExtendedResultGroup title="Custom Reference Dataset">
          <GenericTable title="Imported Reference Summary" rows={customReferenceRows} />
        </ExtendedResultGroup>
      )}
      {extended.stepwise?.active && (
        <ExtendedResultGroup title="Stepwise Variable Selection">
          <GenericTable title="Stepwise Selection Summary" rows={[{
            Method: extended.stepwise.label,
            Metric: extended.stepwise.selection_metric,
            Selected: extended.stepwise.selected_variable_count,
            Requested: extended.stepwise.original_variable_count,
            Threshold: extended.stepwise.threshold,
            Weighting: extended.stepwise.weighting ?? 'unweighted',
            Score: extended.stepwise.best_score
          }]} />
          {Array.isArray(extended.stepwise.step_log) && <GenericTable title="Stepwise Selection Steps (first 250)" rows={extended.stepwise.step_log.slice(0, 250)} />}
        </ExtendedResultGroup>
      )}
      {outputSections.canonicalDetails && extended.case_canonical_score && (
        <ExtendedResultGroup title="Canonical Variate Results">
          <GenericTable title="Case Canonical Variate Score" rows={Array.isArray(extended.case_canonical_score) ? extended.case_canonical_score : [extended.case_canonical_score]} />
          {extended.group_mean_canonical_scores && <GenericTable title="Group Mean Canonical Variate Scores" rows={extended.group_mean_canonical_scores} />}
          {extended.canonical_structure_coefficients && <GenericTable title="Canonical Structure Coefficients" rows={extended.canonical_structure_coefficients} />}
          {extended.model?.eigenvalues && <GenericTable title="Eigenvalues and Percentage of Total Variation" rows={modelEigenRows(extended.model)} />}
          {extended.model?.wilks_lambda !== undefined && <GenericTable title="Model Discriminant Summary" rows={[{ "Wilks Lambda": extended.model.wilks_lambda }]} />}
          {extended.reference_canonical_scores && <GenericTable title="Reference Individual Canonical Variate Scores (first 250)" rows={extended.reference_canonical_scores.slice(0, 250)} />}
          {extended.ln_correlation_matrix_determinant !== undefined && <GenericTable title="Natural Log of Correlation Matrix Determinant" rows={[{ value: extended.ln_correlation_matrix_determinant }]} />}
        </ExtendedResultGroup>
      )}

      {outputSections.classificationStats && extended.additional_classification_statistics?.summary && (
        <ExtendedResultGroup title="Classification Statistics">
          <GenericTable title="Additional Classification Statistics Summary" rows={[extended.additional_classification_statistics.summary]} />
          {extended.additional_classification_statistics?.rows && <GenericTable title="Additional Classification Statistics" rows={extended.additional_classification_statistics.rows} />}
          {(extended.classification?.fd3_table || extended.classification?.table) && <ClassificationMatrixTable classification={extended.classification} mode={classificationMatrixMode} rateMethod={extended.classification?.rate_estimation} />}
        </ExtendedResultGroup>
      )}

      {outputSections.mahalanobisMatrices && (extended.pairwise_mahalanobis || extended.pairwise_mahalanobis_significance) && (
        <ExtendedResultGroup title="Mahalanobis Distances">
          {extended.pairwise_mahalanobis && <GenericTable title="Mahalanobis Distance Matrix" rows={extended.pairwise_mahalanobis} />}
          {extended.pairwise_mahalanobis_significance && <GenericTable title="Significance of Mahalanobis Distances" rows={extended.pairwise_mahalanobis_significance} />}
        </ExtendedResultGroup>
      )}

      {hasOutlierDetails && (
        <ExtendedResultGroup title="Reference Outlier Detection">
          <ResultsOutlierDetection result={result.result} excludeIdsText={excludeIdsText} onExcludeIdsTextChange={onExcludeIdsTextChange} />
        </ExtendedResultGroup>
      )}

      {(outputSections.referenceClassifications || outputSections.nearestNeighbors) && (
        <ExtendedResultGroup title="Reference Classification and Outlier Listing">
          {outputSections.referenceClassifications && extended.reference_classifications && <GenericTable title="Reference Sample Classifications and Outlier Flags" rows={extended.reference_classifications} />}
          {outputSections.nearestNeighbors && neighbors.length > 0 && <GenericTable title={`Nearest ${neighbors.length} Discriminant Neighbors`} rows={neighbors} />}
          {outputSections.nearestNeighbors && neighbors.length > 0 && <GenericTable title="Nearest Neighbors by Population" rows={neighborSummaryRows(neighbors)} />}
        </ExtendedResultGroup>
      )}

      {outputSections.summaryTables && (extended.group_means || extended.group_sds) && (
        <ExtendedResultGroup title="Reference Sample Summary">
          {extended.group_means && <GenericTable title="Group Means" rows={extended.group_means} />}
          {extended.group_sds && <GenericTable title="Standard Deviations" rows={extended.group_sds} />}
        </ExtendedResultGroup>
      )}

      {outputSections.covarianceTables && (extended.pooled_vcvm_summary || extended.vcvm_homogeneity || extended.within_group_vcvm_summaries || extended.pooled_vcvm || extended.pooled_cor) && (
        <ExtendedResultGroup title="Variance-Covariance Diagnostics">
          {extended.pooled_vcvm_summary && <GenericTable title="Pooled Within-Group VCVM Summary" rows={Array.isArray(extended.pooled_vcvm_summary) ? extended.pooled_vcvm_summary : [extended.pooled_vcvm_summary]} />}
          {extended.vcvm_homogeneity && <GenericTable title="VCVM Homogeneity Test (Kullback)" rows={Array.isArray(extended.vcvm_homogeneity) ? extended.vcvm_homogeneity : [extended.vcvm_homogeneity]} />}
          {extended.within_group_vcvm_summaries && <GenericTable title="Within-Group VCVM Determinants and Traces" rows={extended.within_group_vcvm_summaries} />}
          {extended.pooled_vcvm && <GenericTable title="Pooled Within-Group Variance-Covariance Matrix" rows={extended.pooled_vcvm} />}
          {extended.pooled_cor && <GenericTable title="Pooled Within-Group Correlation Matrix" rows={extended.pooled_cor} />}
          {extended.total_vcvm_summary && <GenericTable title="Total Sample VCVM Summary" rows={Array.isArray(extended.total_vcvm_summary) ? extended.total_vcvm_summary : [extended.total_vcvm_summary]} />}
          {extended.total_vcvm && <GenericTable title="Total Sample VCVM" rows={extended.total_vcvm} />}
          {extended.within_group_vcvms && <GenericTable title="Within-Group VCVMs" rows={extended.within_group_vcvms.slice(0, 500)} />}
          {extended.jackknifed_vcvm_summaries && <GenericTable title="Jackknifed VCVM Summaries (first 100)" rows={extended.jackknifed_vcvm_summaries.slice(0, 100)} />}
          {extended.jackknifed_vcvms && <GenericTable title="Jackknifed VCVM Matrix Rows (first 250)" rows={extended.jackknifed_vcvms.slice(0, 250)} />}
        </ExtendedResultGroup>
      )}

      {outputSections.allStatureEquations && extended.all_results && (
        <ExtendedResultGroup title="Stature Equation Details">
          <GenericTable title="All Stature Equations" rows={extended.all_results.slice(0, 100)} statureUnits={statureUnits} />
        </ExtendedResultGroup>
      )}
    </div>
  );
}

function ExtendedResultGroup({ title, children }: { title: string; children: any }) {
  return (
    <section className="panel extended-result-group">
      <div className="extended-result-group-title"><h3>{title}</h3></div>
      <div className="stack compact-result-stack">{children}</div>
    </section>
  );
}

function OutlierIdsControl({ rows, excludeIdsText, onExcludeIdsTextChange }: { rows: Array<Record<string, any>>; excludeIdsText: string; onExcludeIdsTextChange: (value: string) => void }) {
  const [feedback, setFeedback] = useState('');
  const [appliedIdsKey, setAppliedIdsKey] = useState('');
  const ids = extractOutlierIds(rows);
  const idsKey = ids.join('|');
  const existingIds = new Set(parseExcludeIds(excludeIdsText));
  const alreadyListed = ids.length > 0 && ids.every((id) => existingIds.has(id));
  const actionComplete = ids.length > 0 && (alreadyListed || appliedIdsKey === idsKey);
  useEffect(() => {
    if (appliedIdsKey && appliedIdsKey !== idsKey) {
      setAppliedIdsKey('');
      setFeedback('');
    }
  }, [appliedIdsKey, idsKey]);
  if (!ids.length) return null;
  const addIds = () => {
    const merged = mergeExcludeIds(excludeIdsText, ids);
    onExcludeIdsTextChange(merged.text);
    setAppliedIdsKey(idsKey);
    setFeedback(merged.addedCount > 0 ? `Outlier IDs added to Exclude IDs. Re-run analysis to apply the exclusion.` : 'Outlier IDs are already listed. Re-run analysis to apply the exclusion.');
  };
  return (
    <section className={`panel outlier-action-panel ${actionComplete ? 'action-complete' : ''}`}>
      <div className="outlier-action-header">
        <h3>Outlier actions</h3>
        {actionComplete ? (
          <p className="action-status action-status-complete">{feedback || 'Outlier IDs are listed in Exclude IDs. Re-run analysis to apply the exclusion.'}</p>
        ) : (
          <button className="secondary outlier-action-button" onClick={addIds}>Add outlier IDs to Exclude IDs</button>
        )}
      </div>
    </section>
  );
}

function GraphScreen({ result, module, allowDownload, statureUnits }: { result: AnalyzeResponse | null; module: ModuleId; allowDownload: boolean; statureUnits: StatureUnits }) {
  const graphData = result?.result?.graph_data ?? result?.result?.extended_results ?? {};
  const centroids = graphData?.group_mean_canonical_scores;
  const referenceCanonicalScores = graphData?.reference_canonical_scores;
  const referencePosteriorProbabilities = graphData?.reference_posterior_probabilities;
  const casePosteriorProbabilitiesRaw = graphData?.case_posterior_probabilities;
  const pairwiseMahalanobis = graphData?.pairwise_mahalanobis;
  const caseCanonicalScoreRaw = graphData?.case_canonical_score;
  const caseCanonicalScore = Array.isArray(caseCanonicalScoreRaw) ? caseCanonicalScoreRaw[0] : caseCanonicalScoreRaw;
  const casePosteriorProbabilities = Array.isArray(casePosteriorProbabilitiesRaw) ? casePosteriorProbabilitiesRaw[0] : casePosteriorProbabilitiesRaw;
  const topStatureRows = Array.isArray(result?.result?.top_results) ? result?.result?.top_results : [];
  const rawStatureGraphs = result?.result?.stature_graphs ?? result?.result?.selected_equation_graphs ?? graphData?.selected_equation_graphs ?? graphData?.stature?.selected_equation_graphs;
  const statureGraphList = Array.isArray(rawStatureGraphs) ? rawStatureGraphs.filter((graph: Record<string, any>) => graph && !graph.error) : [];
  const fallbackStatureGraph = result?.result?.stature_graph ?? result?.result?.selected_equation_graph ?? graphData?.selected_equation_graph ?? graphData?.stature?.selected_equation_graph;
  const [selectedStatureGraphIndex, setSelectedStatureGraphIndex] = useState(0);
  const statureGraph = statureGraphList[selectedStatureGraphIndex] ?? fallbackStatureGraph;
  const [xAxis, setXAxis] = useState('LD1');
  const [yAxis, setYAxis] = useState('LD2');
  const [histogramBinWidth, setHistogramBinWidth] = useState('0.5');
  const [matchFd3AxisDirection, setMatchFd3AxisDirection] = useState(true);
  const [graphExpanded, setGraphExpanded] = useState(false);
  const graphExpandButtonRef = useRef<HTMLButtonElement | null>(null);
  const showLabels = true;
  const showAxes = true;
  const [showReferencePoints, setShowReferencePoints] = useState(true);
  const [showCentroids, setShowCentroids] = useState(true);
  const [showEllipses, setShowEllipses] = useState(true);
  const showCasePoint = true;
  const [visibleGroups, setVisibleGroups] = useState<Set<string>>(new Set());
  const resultGroupLabels = Array.isArray(result?.result?.groups)
    ? result.result.groups.map((group: any) => String(group ?? '').trim()).filter(Boolean)
    : [];
  const canonicalRowsForGroups = Array.isArray(centroids) && centroids.length
    ? centroids
    : Array.isArray(referenceCanonicalScores) ? referenceCanonicalScores : [];
  const canonicalGroupLabelsForState = Array.from(new Set([
    ...resultGroupLabels,
    ...canonicalRowsForGroups.map((point: Record<string, any>) => String(point.Pop ?? point.group ?? '').trim()).filter(Boolean)
  ]));
  const canonicalGroupStateKey = canonicalGroupLabelsForState.join('\u001f');

  useEffect(() => {
    setVisibleGroups(new Set(canonicalGroupLabelsForState));
  }, [canonicalGroupStateKey]);

  useEffect(() => {
    setSelectedStatureGraphIndex(0);
  }, [result?.operation, result?.result?.stature_result_count]);

  useEffect(() => {
    document.body.classList.toggle('graph-expanded-open', graphExpanded);
    const closeExpandedGraph = () => {
      setGraphExpanded(false);
      window.requestAnimationFrame(() => graphExpandButtonRef.current?.focus());
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && graphExpanded) closeExpandedGraph();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.classList.remove('graph-expanded-open');
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [graphExpanded]);

  const hasCentroids = Array.isArray(centroids) && centroids.length > 0;
  const hasReferenceCanonicalScores = Array.isArray(referenceCanonicalScores) && referenceCanonicalScores.length > 0;
  const hasCaseCanonicalScore = Boolean(caseCanonicalScore && typeof caseCanonicalScore === 'object');
  const hasStatureRows = Array.isArray(topStatureRows) && topStatureRows.length > 0;
  const hasStatureGraph = statureGraph && !statureGraph.error && Array.isArray(statureGraph.reference_points) && statureGraph.reference_points.length > 0;

  if (!hasCentroids && !hasReferenceCanonicalScores && !hasStatureRows && !hasStatureGraph) {
    return <EmptyPanel title="Graph data unavailable" message="Run an analysis. Graph-ready values are calculated automatically with the analysis output." />;
  }

  const axisSource = (hasCentroids ? centroids[0] : hasReferenceCanonicalScores ? referenceCanonicalScores[0] : caseCanonicalScore) ?? {};
  const axisKeys = Object.keys(axisSource).filter((key) => /^LD\d+$/i.test(key));
  const eigenvalueProportions = Array.isArray(result?.result?.model_summary?.eigenvalue_proportions)
    ? result?.result?.model_summary?.eigenvalue_proportions
    : Array.isArray(graphData?.model?.eigenvalue_proportions) ? graphData.model.eigenvalue_proportions : [];
  const yAxisOptions = axisKeys.filter((key) => key !== xAxis);
  const plottedCentroids = hasCentroids ? centroids.filter((point: Record<string, any>) => visibleGroups.has(String(point.Pop ?? point.group ?? '?'))) : [];
  const plottedReferenceScores = hasReferenceCanonicalScores ? referenceCanonicalScores.filter((point: Record<string, any>) => visibleGroups.has(String(point.Pop ?? point.group ?? '?'))) : [];
  const visibleGroupLabels = Array.from(visibleGroups).map(String);
  const canonicalRows = canonicalRowsForGroups;
  const canonicalGroupLabels = canonicalGroupLabelsForState;
  const graphColorMap = buildGraphColorMap(canonicalGroupLabels);
  const showTwoGroupHistogram = canonicalGroupLabels.length === 2 && hasReferenceCanonicalScores && axisKeys.includes('LD1');
  const visibleTernaryGroups = canonicalGroupLabels.filter((label) => visibleGroups.has(String(label))).map(String);
  const hasTernaryPlot = Array.isArray(referencePosteriorProbabilities) && visibleTernaryGroups.length === 3;
  const dendrogramCentroids = hasCentroids ? plottedCentroids : [];
  const hasDendrogramPlot = dendrogramCentroids.length >= 3 || (Array.isArray(pairwiseMahalanobis) && pairwiseMahalanobis.length >= 3);
  const hasThreeDimensionalPlot = hasReferenceCanonicalScores && axisKeys.includes('LD3');
  const primaryGraphSubtitle = showTwoGroupHistogram
    ? 'DF score histogram'
    : result?.operation === 'custom_reference_dfa'
      ? (String(result?.result?.custom_reference?.reference_label ?? '').trim() || 'Imported reference data')
      : '';

  function toggleGraphGroup(label: string) {
    setVisibleGroups((current) => {
      const next = new Set(current);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  return (
    <div className={`grid graph-layout ${graphExpanded ? 'fullscreen-graph-layout' : ''}`}>
      <div className="graph-stack">
        {(hasCentroids || showTwoGroupHistogram) && (
          <section className="panel primary-graph-panel">
            <div className="section-title-row graph-primary-title-row">
              <div>
                <h3>{showTwoGroupHistogram ? 'Two-group Discriminant Function Results' : result?.operation === 'custom_reference_dfa' ? 'Custom Reference Canonical Plot' : module === 'postcranial_stature' ? 'Postcranial DFA Canonical Plot' : 'Canonical Scatterplot'}</h3>
                {primaryGraphSubtitle && <span className="graph-title-note">{primaryGraphSubtitle}</span>}
              </div>
              <button
                ref={graphExpandButtonRef}
                className="secondary compact-action graph-expand-button"
                aria-expanded={graphExpanded}
                onClick={() => setGraphExpanded((current) => !current)}
              >{graphExpanded ? 'Exit full screen' : 'Expand plot'}</button>
            </div>
            {showTwoGroupHistogram ? (
              <TwoGroupHistogramPlot
                referencePoints={plottedReferenceScores}
                casePoint={hasCaseCanonicalScore ? caseCanonicalScore : null}
                binWidth={parseNumberOrDefault(histogramBinWidth, 0.5)}
                module={module}
                colorMap={graphColorMap}
                caseId={result?.result?.case_id ?? ''}
              />
            ) : (
              <CanonicalPlot
                centroids={plottedCentroids}
                referencePoints={plottedReferenceScores}
                showReferencePoints={showReferencePoints}
                casePoint={showCasePoint && hasCaseCanonicalScore ? caseCanonicalScore : null}
                xAxis={xAxis}
                yAxis={yAxis}
                showLabels={showLabels}
                showAxes={showAxes}
                showCentroids={showCentroids}
                showEllipses={showEllipses}
                visibleGroupLabels={visibleGroupLabels}
                module={module}
                colorMap={graphColorMap}
                eigenvalueProportions={eigenvalueProportions}
                orientationMultiplier={matchFd3AxisDirection ? -1 : 1}
              />
            )}
          </section>
        )}
        {hasTernaryPlot && (
          <section className="panel">
            <div className="section-title-row">
              <h3>Ternary Plot</h3>
              {allowDownload && <button className="secondary graph-export-button" onClick={() => downloadSvg('ternary-plot-svg', 'fordisc4_ternary_plot.svg')}>Download SVG</button>}
            </div>
            <TernaryPlot posteriorRows={referencePosteriorProbabilities} casePosterior={casePosteriorProbabilities} groups={visibleTernaryGroups} module={module} colorMap={graphColorMap} />
          </section>
        )}
        {hasDendrogramPlot && (
          <section className="panel">
            <div className="section-title-row">
              <h3>Dendrogram of Group Relationships</h3>
              {allowDownload && <button className="secondary graph-export-button" onClick={() => downloadSvg('dendrogram-plot-svg', 'fordisc4_dendrogram.svg')}>Download SVG</button>}
            </div>
            <DendrogramPlot matrixRows={Array.isArray(pairwiseMahalanobis) ? pairwiseMahalanobis : []} centroids={dendrogramCentroids} module={module} colorMap={graphColorMap} />
          </section>
        )}
        {hasThreeDimensionalPlot && (
          <section className="panel">
            <div className="section-title-row">
              <h3>3D Canonical Plot</h3>
              {allowDownload && <button className="secondary graph-export-button" onClick={() => downloadSvg('canonical-3d-plot-svg', 'fordisc4_3d_canonical_plot.svg')}>Download SVG</button>}
            </div>
            <Canonical3DPlot centroids={plottedCentroids} referencePoints={plottedReferenceScores} casePoint={showCasePoint && hasCaseCanonicalScore ? caseCanonicalScore : null} module={module} colorMap={graphColorMap} orientationMultiplier={matchFd3AxisDirection ? -1 : 1} />
          </section>
        )}
        {hasStatureGraph && (
          <section className="panel">
            <div className="section-title-row">
              <h3>Predicted Stature Scatterplot</h3>
              <div className="table-actions stature-graph-actions">
                {statureGraphList.length > 1 && (
                  <label className="inline-select-label">Equation
                    <select value={selectedStatureGraphIndex} onChange={(event) => setSelectedStatureGraphIndex(Number(event.target.value))}>
                      {statureGraphList.map((graph: Record<string, any>, index: number) => (
                        <option key={`${graph.measurement}-${index}`} value={index}>{index + 1}. {graph.measurement}</option>
                      ))}
                    </select>
                  </label>
                )}
                {allowDownload && <button className="secondary graph-export-button" onClick={() => downloadSvg('fd3-stature-plot-svg', 'fordisc4_selected_stature_equation.svg')}>Download SVG</button>}
              </div>
            </div>
            <FD3StaturePlot graph={statureGraph} caseId={result?.result?.case_id ?? ''} statureUnits={statureUnits} />
          </section>
        )}
        {hasStatureRows && (
          <section className="panel">
            <div className="section-title-row">
              <h3>Supplemental Stature Estimate Summary</h3>
              <div className="table-actions">
                {allowDownload && <button className="secondary graph-export-button" onClick={() => downloadSvg('stature-plot-svg', 'fordisc4_stature_estimates.svg')}>Download SVG</button>}
              </div>
            </div>
            <StatureIntervalPlot rows={topStatureRows.slice(0, 12)} statureUnits={statureUnits} />
          </section>
        )}
      </div>
      {(hasCentroids || showTwoGroupHistogram) && (
        <section className="panel graph-controls-panel">
          <h3>Graph controls</h3>
          {showTwoGroupHistogram ? (
            <label className="field-label">Bin width
              <input value={histogramBinWidth} onChange={(event) => setHistogramBinWidth(event.target.value)} inputMode="decimal" />
            </label>
          ) : (
            <>
              <label className="field-label">X axis
                <select value={xAxis} onChange={(event) => setXAxis(event.target.value)}>
                  {axisKeys.map((key) => <option key={key} value={key}>{canonicalAxisDisplayLabel(key, eigenvalueProportions)}</option>)}
                </select>
              </label>
              <label className="field-label">Y axis
                <select value={yAxis} onChange={(event) => setYAxis(event.target.value)}>
                  {yAxisOptions.map((key) => <option key={key} value={key}>{canonicalAxisDisplayLabel(key, eigenvalueProportions)}</option>)}
                </select>
              </label>
              <label className="toggle-row">
                <input type="checkbox" checked={showReferencePoints} onChange={(event) => setShowReferencePoints(event.target.checked)} />
                <span>Show reference points</span>
              </label>
              <label className="toggle-row">
                <input type="checkbox" checked={showCentroids} onChange={(event) => setShowCentroids(event.target.checked)} />
                <span>Show centroids</span>
              </label>
              <label className="toggle-row">
                <input type="checkbox" checked={showEllipses} onChange={(event) => setShowEllipses(event.target.checked)} />
                <span>Show population ellipses</span>
              </label>
              <label className="toggle-row">
                <input type="checkbox" checked={matchFd3AxisDirection} onChange={(event) => setMatchFd3AxisDirection(event.target.checked)} />
                <span>FD3 axis orientation</span>
              </label>
            </>
          )}
          {allowDownload && <button className="secondary graph-download-button" onClick={() => downloadSvg('canonical-plot-svg', 'fordisc4_canonical_plot.svg')}>Download DFA SVG</button>}
          <div className="graph-group-list">
            <strong>Group visibility</strong>
            {canonicalRows.filter((point: Record<string, any>, index: number, rows: Array<Record<string, any>>) => {
              const label = String(point.Pop ?? point.group ?? '?');
              return rows.findIndex((candidate) => String(candidate.Pop ?? candidate.group ?? '?') === label) === index;
            }).map((point: Record<string, any>) => {
              const label = String(point.Pop ?? point.group ?? '?');
              return (
                <label key={label} className="toggle-row compact-toggle group-color-toggle">
                  <input type="checkbox" checked={visibleGroups.has(label)} onChange={() => toggleGraphGroup(label)} />
                  <span className="group-color-swatch" style={{ backgroundColor: graphColorFor(label, module, graphColorMap) }} aria-hidden="true" />
                  <span>{label}</span>
                </label>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}


function HelpScreen({ document, loading, error }: { document: HelpDocument | null; loading: boolean; error: string }) {
  const [query, setQuery] = useState('');
  const sections = useMemo(() => splitHelpSections(document?.markdown ?? ''), [document]);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleSections = normalizedQuery
    ? sections.filter((section) => `${section.title}\n${section.body.join('\n')}`.toLowerCase().includes(normalizedQuery))
    : sections;
  const activeQuery = query.trim();

  return (
    <div className="help-workspace">
      <section className="panel help-hero-panel">
        <div>
          <p className="options-kicker">FORDISC 4.0</p>
          <h3>Help</h3>
          {activeQuery && !loading && !error && (
            <p className="help-search-summary">Showing {visibleSections.length} matching section{visibleSections.length === 1 ? '' : 's'}; matched terms are highlighted.</p>
          )}
        </div>
        <label className="field-label help-search-field">Search help
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="measurement, stepwise, report…" />
        </label>
      </section>

      {loading && <section className="panel"><p className="helper-text">Loading help…</p></section>}
      {error && <section className="panel warning-panel"><strong>Help unavailable.</strong><p>{error}</p></section>}
      {!loading && !error && document && (
        <div className="help-grid">
          <aside className="panel help-toc-panel">
            <h3>Contents</h3>
            <nav className="help-toc-list" aria-label="Help contents">
              {(activeQuery ? visibleSections : sections).map((section) => (
                <a key={section.id} href={`#${section.id}`}>{highlightText(section.title, activeQuery)}</a>
              ))}
            </nav>
          </aside>
          <section className="panel help-content-panel">
            {visibleSections.length === 0 && <p className="helper-text">No help sections match that search.</p>}
            {visibleSections.map((section) => (
              <article key={section.id} id={section.id} className="help-section">
                <h3>{highlightText(section.title, activeQuery)}</h3>
                {renderHelpLines(section.body, activeQuery)}
              </article>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}

function splitHelpSections(markdown: string) {
  const lines = markdown.split(/\r?\n/);
  const sections: Array<{ id: string; title: string; body: string[] }> = [];
  let current: { id: string; title: string; body: string[] } | null = null;
  for (const line of lines) {
    if (line.startsWith('# ')) {
      continue;
    }
    if (line.startsWith('## ')) {
      if (current) sections.push(current);
      const title = line.replace(/^##\s+/, '').replace(/^\d+\.\s*/, '').trim();
      current = { id: `help-${slugify(title)}`, title, body: [] };
    } else if (current) {
      current.body.push(line);
    }
  }
  if (current) sections.push(current);
  return sections;
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section';
}

function renderHelpLines(lines: string[], query = '') {
  const blocks: any[] = [];
  let listItems: string[] = [];
  const flushList = () => {
    if (listItems.length) {
      blocks.push(<ul key={`list-${blocks.length}`}>{listItems.map((item, index) => <li key={index}>{formatInlineMarkdown(item, query)}</li>)}</ul>);
      listItems = [];
    }
  };
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      return;
    }
    if (trimmed.startsWith('### ')) {
      flushList();
      blocks.push(<h4 key={`h-${index}`}>{highlightText(trimmed.replace(/^###\s+/, ''), query)}</h4>);
      return;
    }
    if (trimmed.startsWith('- ')) {
      listItems.push(trimmed.replace(/^-\s+/, ''));
      return;
    }
    if (/^\d+\.\s+/.test(trimmed)) {
      listItems.push(trimmed.replace(/^\d+\.\s+/, ''));
      return;
    }
    flushList();
    blocks.push(<p key={`p-${index}`}>{formatInlineMarkdown(trimmed, query)}</p>);
  });
  flushList();
  return blocks;
}

function formatInlineMarkdown(text: string, query = '') {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{highlightText(part.slice(2, -2), query)}</strong>;
    return <span key={index}>{highlightText(part, query)}</span>;
  });
}

function highlightText(text: string, query = '') {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return text;
  const escaped = trimmedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!escaped) return text;
  const regex = new RegExp(`(${escaped})`, 'ig');
  return text.split(regex).map((part, index) => (
    part.toLowerCase() === trimmedQuery.toLowerCase()
      ? <mark key={index} className="help-search-highlight">{part}</mark>
      : <span key={index}>{part}</span>
  ));
}

function ExportScreen({ interfaceLanguage, result, selectedModule, caseId, runLogEntries, analystName, onAnalystNameChange, sortGroupsMode, classificationMatrixMode, typicalityDisplay, statureUnits, transformationMode, stepwiseMode, stepwiseMinVariables, stepwiseMaxVariables, stepwiseThreshold, stepwiseTurbo, stepwiseWeighting, classifyOnlyIfTypF, classifyOnlyIfTypFThreshold, classifyCase, classificationRateMode, checkMeasurementErrors, outlierDetectionThreshold, nearestNeighborCount, excludeIdsText }: { interfaceLanguage: InterfaceLanguage; result: AnalyzeResponse | null; selectedModule: ModuleId; caseId: string; runLogEntries: RunLogEntry[]; analystName: string; onAnalystNameChange: (value: string) => void; sortGroupsMode: SortGroupsMode; classificationMatrixMode: ClassificationMatrixMode; typicalityDisplay: TypicalityDisplaySettings; statureUnits: StatureUnits; transformationMode: TransformationMode; stepwiseMode: StepwiseMode; stepwiseMinVariables: string; stepwiseMaxVariables: string; stepwiseThreshold: string; stepwiseTurbo: boolean; stepwiseWeighting: StepwiseWeighting; classifyOnlyIfTypF: boolean; classifyOnlyIfTypFThreshold: string; classifyCase: boolean; classificationRateMode: ClassificationRateMode; checkMeasurementErrors: boolean; outlierDetectionThreshold: string; nearestNeighborCount: string; excludeIdsText: string }) {
  const reportOptions = { interfaceLanguage, sortGroupsMode, classificationMatrixMode, typicalityDisplay, statureUnits, transformationMode, checkMeasurementErrors, outlierDetectionThreshold, nearestNeighborCount, excludeIdsText, analystName, stepwiseMode, stepwiseMinVariables, stepwiseMaxVariables, stepwiseThreshold, stepwiseTurbo, stepwiseWeighting, classifyOnlyIfTypF, classifyOnlyIfTypFThreshold, classifyCase, classificationRateMode };
  const currentDisplaySettings: CaseReportDisplaySettings = { sortGroupsMode, classificationMatrixMode, typicalityDisplay, statureUnits };
  const caseAnalyses = collectLatestCaseReportAnalyses(runLogEntries, result, selectedModule, currentDisplaySettings);
  const reportAvailable = caseAnalyses.length > 0;
  return (
    <div className="stack report-screen-stack">
      <section className="panel report-export-panel report-only-panel">
        <h3>Case Report</h3>
        <label className="field-label report-analyst-field">Analyst name
          <input value={analystName} onChange={(event) => onAnalystNameChange(event.target.value)} placeholder="e.g. RLJ, R. Jantz, or Richard Jantz" />
        </label>
        <p className="helper-text">The Case Report summarizes the latest completed FDB, Howells, Postcranial DFA, and Stature results for this case. The Run Log remains the complete chronological record.</p>
        <p className="helper-text">Download Case Report opens a print-ready view. Choose Save as PDF in the browser print dialog.</p>
        <div className="toolbar export-toolbar">
          <button className="secondary emphasized-export" disabled={!reportAvailable} onClick={() => printCaseReportHtml(result, selectedModule, runLogEntries, caseId, reportOptions)}>Download Case Report</button>
          <button className="secondary emphasized-export" disabled={!runLogEntries.length} onClick={() => printRunLogPdf(runLogEntries, caseId, interfaceLanguage)}>Export Run Log as PDF</button>
        </div>
      </section>
    </div>
  );
}

function MeasurementChecksTable({ rows }: { rows: Array<Record<string, any>> }) {
  if (!rows.length) return null;
  const groupColumns = Array.from(new Set(rows.flatMap((row) => Object.keys(row.group_means ?? {}))));
  const hasWeights = rows.some((row) => row.df_weight !== null && row.df_weight !== undefined);
  const hasGroupImportance = rows.some((row) => row.relative_group_importance_percent !== null && row.relative_group_importance_percent !== undefined);
  const hasCaseImportance = rows.some((row) => row.relative_case_importance_percent !== null && row.relative_case_importance_percent !== undefined);
  return (
    <section className="panel table-panel measurement-check-panel">
      <div className="section-title-row simple-title-row">
        <h3>Measurement Checks</h3>
      </div>
      <div className="scroll-table">
        <table className="measurement-check-table fd3-measurement-check-table">
          <caption className="sr-only">Measurement Checks</caption>
          <thead>
            <tr>
              <th scope="col">Variable</th>
              <th scope="col">Current Case</th>
              <th scope="col">Check</th>
              {groupColumns.map((group) => <th scope="col" key={group}>{group}</th>)}
              {hasWeights && <th scope="col">DF Weights</th>}
              {hasGroupImportance && <th scope="col">GS Imp %</th>}
              {hasCaseImportance && <th scope="col">CC Imp %</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => {
              const marker = String(row.check_marker ?? row.check ?? formatSignedSd(row.standard_deviations_from_mean));
              const deviationClass = measurementDeviationClass(marker || row.standard_deviations_from_mean);
              return (
              <tr key={rowIndex} className={deviationClass}>
                <th scope="row">{row.variable ?? '—'}</th>
                <td className="measurement-case-value">{formatCell(row.current_case ?? row.value)}</td>
                <td className="check-marker-cell measurement-check-marker">{marker}</td>
                {groupColumns.map((group) => <td key={`${rowIndex}-${group}`}>{formatOneDecimalCell(row.group_means?.[group])}</td>)}
                {hasWeights && <td>{formatCell(row.df_weight)}</td>}
                {hasGroupImportance && <td>{formatOneDecimalCell(row.relative_group_importance_percent)}</td>}
                {hasCaseImportance && <td>{formatOneDecimalCell(row.relative_case_importance_percent)}</td>}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function sortedRelationshipRows(rows: Array<Record<string, any>>, sortGroupsMode: SortGroupsMode) {
  return sortGroupsMode === 'group_name'
    ? [...rows].sort((a, b) => String(a.group ?? '').localeCompare(String(b.group ?? ''), undefined, { numeric: true, sensitivity: 'base' }))
    : [...rows].sort((a, b) => Number(a.d_squared ?? 0) - Number(b.d_squared ?? 0));
}

function RelationshipTable({ rows, sortGroupsMode, typicalityDisplay }: { rows: Array<Record<string, any>>; sortGroupsMode: SortGroupsMode; typicalityDisplay: TypicalityDisplaySettings }) {
  if (!rows.length) return null;
  const topGroup = String(rows[0]?.group ?? '');
  const sortedRows = sortedRelationshipRows(rows, sortGroupsMode);
  const rankedValue = (row: Record<string, any>) => {
    const rank = row.typicality_rank && row.typicality_rank_denominator ? ` (${row.typicality_rank}/${row.typicality_rank_denominator})` : '';
    return <><TypicalityValue value={row.typicality_ranked} />{rank}</>;
  };
  const probabilityColumnCount = 1 + (typicalityDisplay.f ? 1 : 0) + (typicalityDisplay.chi ? 1 : 0) + (typicalityDisplay.ranked ? 1 : 0);
  const probabilityColumnWidth = `${Math.max(10, 58 / Math.max(probabilityColumnCount, 1))}%`;
  return (
    <section className="panel table-panel relationship-panel">
      <div className="section-title-row simple-title-row">
        <h3>Multigroup Classification</h3>
      </div>
      <div className="scroll-table">
        <table className="relationship-table fd3-relationship-table">
          <caption className="sr-only">Multigroup Classification</caption>
          <colgroup>
            <col className="relationship-group-col" />
            <col className="relationship-classified-col" />
            <col className="relationship-distance-col" />
            <col className="relationship-probability-col" style={{ width: probabilityColumnWidth }} />
            {typicalityDisplay.f && <col className="relationship-probability-col" style={{ width: probabilityColumnWidth }} />}
            {typicalityDisplay.chi && <col className="relationship-probability-col" style={{ width: probabilityColumnWidth }} />}
            {typicalityDisplay.ranked && <col className="relationship-probability-col" style={{ width: probabilityColumnWidth }} />}
          </colgroup>
          <thead>
            <tr>
              <th scope="col" rowSpan={2}>Group</th>
              <th scope="col" rowSpan={2}>Classified<br/>into</th>
              <th scope="col" rowSpan={2}>Distance<br/>from</th>
              <th scope="colgroup" className="probability-header" colSpan={probabilityColumnCount}>Probabilities</th>
            </tr>
            <tr>
              <th scope="col" className="probability-subheader posterior-subheader">Posterior</th>{typicalityDisplay.f && <th scope="col" className="probability-subheader">Typ. F</th>}{typicalityDisplay.chi && <th scope="col" className="probability-subheader">Typ. χ²</th>}{typicalityDisplay.ranked && <th scope="col" className="probability-subheader">Typ. R</th>}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, rowIndex) => {
              const isTop = String(row.group ?? '') === topGroup;
              return (
                <tr key={rowIndex} className={isTop ? 'top-row' : ''}>
                  <th scope="row">{row.group ?? '—'}</th>
                  <td className="classified-into-cell">{isTop ? <strong>{topGroup}</strong> : ''}</td>
                  <td>{formatNumber(row.d_squared)}</td>
                  <td className="probability-cell posterior-cell">{formatProbability(row.posterior_probability)}</td>
                  {typicalityDisplay.f && <td className="probability-cell"><TypicalityValue value={row.typicality_f} /></td>}
                  {typicalityDisplay.chi && <td className="probability-cell"><TypicalityValue value={row.typicality_chi_square} /></td>}
                  {typicalityDisplay.ranked && <td className="probability-cell">{rankedValue(row)}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}


const CLASSIFICATION_MATRIX_METADATA_COLUMNS = new Set([
  'ACTUAL', 'GROUP', 'POP', 'FROMGROUP', 'TOTALNUMBER', 'N', 'TOTAL', 'CORRECT',
  'PREDICTED', 'PREDICTION', 'INTOGROUP', 'FREQ', 'FREQUENCY', 'COUNT', 'PERCENT', 'PERCENTAGE'
]);

function classificationMatrixColumnKey(value: string) {
  return normalizeHeader(value);
}

function classificationMatrixIsMetadataColumn(column: string) {
  const key = classificationMatrixColumnKey(column);
  return CLASSIFICATION_MATRIX_METADATA_COLUMNS.has(key) || /^ACTUAL\d+$/i.test(key);
}

function classificationMatrixNumber(value: any): number | null {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/%/g, '').trim();
  if (text === '' || text === '—') return null;
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : null;
}

function classificationMatrixPercent(value: number) {
  return `${value.toFixed(1)} %`;
}

function classificationMatrixFindKey(row: Record<string, any>, candidates: string[]) {
  const normalized = new Set(candidates.map(classificationMatrixColumnKey));
  return Object.keys(row).find((key) => normalized.has(classificationMatrixColumnKey(key))) ?? null;
}

function classificationMatrixFindKeyAcrossRows(rows: Array<Record<string, any>>, candidates: string[]) {
  for (const row of rows) {
    const key = classificationMatrixFindKey(row, candidates);
    if (key) return key;
  }
  return null;
}

function classificationMatrixGroupColumns(rows: Array<Record<string, any>>) {
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (seen.has(key) || classificationMatrixIsMetadataColumn(key)) continue;
      const hasNumericValue = rows.some((candidateRow) => classificationMatrixNumber(candidateRow[key]) !== null);
      if (!hasNumericValue) continue;
      seen.add(key);
      columns.push(key);
    }
  }
  return columns;
}

function classificationMatrixActualGroup(row: Record<string, any>, groupColumns: string[] = []) {
  const candidates = [row['From Group'], row.Group, row.Pop, row.Actual, row.actual]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);
  const direct = candidates.find((value) => groupColumns.includes(value));
  return direct ?? candidates.find((value) => !/^\d+$/.test(value)) ?? candidates[0] ?? '';
}

function classificationMatrixLongRowsToWide(rows: Array<Record<string, any>>) {
  if (!rows.length) return [] as Array<Record<string, any>>;
  const actualKey = classificationMatrixFindKeyAcrossRows(rows, ['Actual', 'From Group', 'Group', 'Pop']);
  const predictedKey = classificationMatrixFindKeyAcrossRows(rows, ['Predicted', 'Prediction', 'Into Group']);
  const freqKey = classificationMatrixFindKeyAcrossRows(rows, ['Freq', 'Frequency', 'Count', 'N']);
  if (!actualKey || !predictedKey || !freqKey) return [];

  const actualOrder: string[] = [];
  const groupOrder: string[] = [];
  const matrix = new Map<string, Record<string, number>>();
  for (const row of rows) {
    const actual = String(row[actualKey] ?? '').trim();
    const predicted = String(row[predictedKey] ?? '').trim();
    const value = classificationMatrixNumber(row[freqKey]);
    if (!actual || !predicted || value === null) continue;
    if (/^\d+$/.test(actual) && !rows.some((candidate) => String(candidate[predictedKey] ?? '').trim() === actual)) continue;
    if (!actualOrder.includes(actual)) actualOrder.push(actual);
    if (!groupOrder.includes(predicted)) groupOrder.push(predicted);
    if (!matrix.has(actual)) matrix.set(actual, {});
    matrix.get(actual)![predicted] = (matrix.get(actual)![predicted] ?? 0) + value;
  }
  const labels = groupOrder.length ? groupOrder : actualOrder;
  if (actualOrder.length < 2 || labels.length < 2) return [];
  return actualOrder.map((actual) => {
    const out: Record<string, any> = { Actual: actual };
    for (const group of labels) out[group] = matrix.get(actual)?.[group] ?? 0;
    return out;
  });
}

function normalizeFd3ClassificationMatrixRows(rows: Array<Record<string, any>>, mode: ClassificationMatrixMode = 'counts') {
  if (!rows.length) return [];
  const longWideRows = classificationMatrixLongRowsToWide(rows);
  const sourceRows = longWideRows.length ? longWideRows : rows;
  const groupColumns = classificationMatrixGroupColumns(sourceRows);
  if (groupColumns.length < 2) return [];
  const normalized = sourceRows.map((row) => {
    const actual = classificationMatrixActualGroup(row, groupColumns);
    const summedTotal = groupColumns.reduce((sum, group) => sum + (classificationMatrixNumber(row[group]) ?? 0), 0);
    const explicitTotal = classificationMatrixNumber(row['Total Number'] ?? row.N ?? row.Total);
    const total = explicitTotal ?? summedTotal;
    const out: Record<string, any> = {
      'From Group': actual,
      'Total Number': total
    };
    for (const group of groupColumns) {
      const value = classificationMatrixNumber(row[group]) ?? 0;
      out[group] = mode === 'percentages' ? (total > 0 ? classificationMatrixPercent((value / total) * 100) : '—') : value;
    }
    const correctFromRow = String(row.Correct ?? '').trim();
    const diagonal = groupColumns.includes(actual) ? (classificationMatrixNumber(row[actual]) ?? 0) : 0;
    out.Correct = /%/.test(correctFromRow)
      ? correctFromRow.replace(/\s*%$/, ' %')
      : (total > 0 ? classificationMatrixPercent((diagonal / total) * 100) : (correctFromRow || '—'));
    return out;
  }).filter((row) => String(row['From Group'] ?? '').trim());

  const validDiagonalRows = normalized.filter((row) => groupColumns.includes(String(row['From Group'] ?? '').trim())).length;
  if (!validDiagonalRows && normalized.length > 1) return [];
  return normalized;
}

function classificationMatrixRowsAreUsable(rows: Array<Record<string, any>>) {
  if (!rows.length) return false;
  const groupColumns = classificationMatrixGroupColumns(rows);
  if (groupColumns.length < 2) return false;
  const total = rows.reduce((sum, row) => sum + (classificationMatrixNumber(row['Total Number']) ?? 0), 0);
  const matchingRows = rows.filter((row) => groupColumns.includes(String(row['From Group'] ?? '').trim())).length;
  return total > 0 && matchingRows > 0;
}

function classificationMatrixFd3Rows(rows: Array<Record<string, any>>, mode: ClassificationMatrixMode = 'counts') {
  return normalizeFd3ClassificationMatrixRows(rows, mode);
}

function classificationMatrixSourceRows(classification: Record<string, any> | undefined, mode: ClassificationMatrixMode = 'counts') {
  const sources = [classification?.table, classification?.fd3_table];
  for (const source of sources) {
    if (!Array.isArray(source) || !source.length) continue;
    const normalized = normalizeFd3ClassificationMatrixRows(source, mode);
    if (classificationMatrixRowsAreUsable(normalized)) return normalized;
  }
  return [];
}

function classificationMatrixRowsForDisplay(classification: Record<string, any> | undefined, mode: ClassificationMatrixMode = 'counts') {
  return classificationMatrixSourceRows(classification, mode);
}

function classificationMatrixPercentageRows(rows: Array<Record<string, any>>) {
  return classificationMatrixFd3Rows(rows, 'percentages');
}

function classificationMatrixTotalCorrectFromClassification(classification: Record<string, any> | undefined, rateMethod?: string) {
  const totalCorrect = classification?.total_correct;
  if (!totalCorrect || totalCorrect.correct === undefined || totalCorrect.total === undefined) return '';
  const correct = Math.round(Number(totalCorrect.correct));
  const total = Math.round(Number(totalCorrect.total));
  if (!Number.isFinite(correct) || !Number.isFinite(total) || total <= 0) return '';
  const percent = Number.isFinite(Number(totalCorrect.percent)) ? Number(totalCorrect.percent) : (correct / total) * 100;
  const method = rateMethod ?? classification?.rate_estimation ?? totalCorrect.method;
  const crossValidated = totalCorrect.cross_validated === true || method !== 'resubstitution';
  const suffix = crossValidated ? ' *** CROSS-VALIDATED ***' : '';
  return `Total Correct: ${correct} out of ${total} (${percent.toFixed(1)} %)${suffix}`;
}

function classificationMatrixTotalLineFromRows(rows: Array<Record<string, any>>, rateMethod?: string) {
  const displayRows = normalizeFd3ClassificationMatrixRows(rows, 'counts');
  let total = 0;
  let correct = 0;
  for (const row of displayRows) {
    const actual = String(row['From Group'] ?? '').trim();
    total += classificationMatrixNumber(row['Total Number']) ?? 0;
    correct += classificationMatrixNumber(row[actual]) ?? 0;
  }
  if (!total) return '';
  const suffix = rateMethod === 'resubstitution' ? '' : ' *** CROSS-VALIDATED ***';
  return `Total Correct: ${Math.round(correct)} out of ${Math.round(total)} (${((correct / total) * 100).toFixed(1)} %)${suffix}`;
}

function classificationMatrixTotalLine(classificationOrRows: Record<string, any> | Array<Record<string, any>> | undefined, rateMethod?: string) {
  if (classificationOrRows && !Array.isArray(classificationOrRows)) {
    const classification = classificationOrRows as Record<string, any>;
    const fromSummary = classificationMatrixTotalCorrectFromClassification(classification, rateMethod);
    if (fromSummary) return fromSummary;
    const existing = String(classification.fd3_total_correct ?? '').trim();
    if (existing && existing.toLowerCase() !== 'na') return existing;
    const rows = classificationMatrixSourceRows(classification, 'counts');
    const method = rateMethod ?? classification.rate_estimation;
    return classificationMatrixTotalLineFromRows(rows, method);
  }
  return classificationMatrixTotalLineFromRows(Array.isArray(classificationOrRows) ? classificationOrRows : [], rateMethod);
}

function ClassificationMatrixTable({ classification, rows, mode, rateMethod }: { classification?: Record<string, any>; rows?: Array<Record<string, any>>; mode: ClassificationMatrixMode; rateMethod?: string }) {
  const displayRows = classification ? classificationMatrixRowsForDisplay(classification, mode) : classificationMatrixFd3Rows(rows ?? [], mode);
  if (!displayRows.length) return null;
  const columns = Object.keys(displayRows[0] ?? {});
  const groupColumns = columns.filter((column) => !['From Group', 'Total Number', 'Correct'].includes(column));
  const totalLine = classification ? classificationMatrixTotalLine(classification, rateMethod) : classificationMatrixTotalLine(displayRows, rateMethod);
  const cellClass = (column: string) => {
    if (column === 'Total Number') return 'fd3-matrix-total-number';
    if (groupColumns.includes(column)) return 'fd3-matrix-group-value';
    if (column === 'Correct') return 'fd3-matrix-correct';
    return '';
  };
  return (
    <section className="panel table-panel classification-matrix-panel">
      <div className="section-title-row simple-title-row">
        <h3>{mode === 'percentages' ? 'Classification Matrix (%)' : 'Classification Matrix'}</h3>
      </div>
      <div className="scroll-table">
        <table className="generic-table fd3-classification-matrix-table">
          <caption className="sr-only">{mode === 'percentages' ? 'Classification Matrix percentages' : 'Classification Matrix counts'}</caption>
          <thead>
            <tr>
              <th scope="col" rowSpan={2}>From<br/>Group</th>
              <th scope="col" rowSpan={2} className="fd3-matrix-total-number">Total<br/>Number</th>
              <th scope="colgroup" className="fd3-matrix-into-group-header" colSpan={Math.max(groupColumns.length, 1)}>Into Group {mode === 'percentages' ? '(%)' : '(counts)'}</th>
              <th scope="col" rowSpan={2}>Correct</th>
            </tr>
            <tr>{groupColumns.map((column) => <th scope="col" key={column} className="fd3-matrix-group-value">{column}</th>)}</tr>
          </thead>
          <tbody>
            {displayRows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {columns.map((column) => column === 'From Group'
                  ? <th scope="row" key={`${rowIndex}-${column}`} className={cellClass(column)}>{formatCell(row[column])}</th>
                  : <td key={`${rowIndex}-${column}`} className={cellClass(column)}>{formatCell(row[column])}</td>)}
              </tr>
            ))}
          </tbody>
          {totalLine && <tfoot><tr><td colSpan={columns.length} className="fd3-matrix-total-correct-line">{totalLine}</td></tr></tfoot>}
        </table>
      </div>
    </section>
  );
}

function compactTableHeader(column: string) {
  const normalized = normalizeHeader(column);
  const aliases: Record<string, string> = {
    LEFTOUTID: 'ID',
    LEFTOUTGROUP: 'Group',
    LEFTOUTINDEX: '#',
    DEGREESOFFREEDOM: 'df',
    NATURALLOGDETERMINANT: 'ln det',
    DETERMINANT: 'det',
    TRACE: 'trace'
  };
  return aliases[normalized] ?? humanize(column);
}

function referenceRowHasOutlierFlag(row: Record<string, any>) {
  return Object.entries(row).some(([key, value]) => {
    const normalizedKey = normalizeHeader(key);
    const textValue = String(value ?? '').trim();
    if (/OUTLIER|FLAG/.test(normalizedKey) && !['', '0', 'FALSE', 'NO', 'NONE', '—'].includes(textValue.toUpperCase())) return true;
    return /^(?:\*{2,4}|\+{2,4})$/.test(textValue);
  });
}

function GenericTable({ title, rows, statureUnits = 'in' }: { title: string; rows: Array<Record<string, any>>; statureUnits?: StatureUnits }) {
  if (!rows.length) return null;
  const columns = Object.keys(rows[0]).filter((column) => !column.startsWith('__'));
  const compactJackknife = /^Jackknifed VCVM/i.test(title);
  const allRowsAreOutliers = /^Reference Outliers/i.test(title);
  return (
    <section className={`panel table-panel${compactJackknife ? ' compact-vcvm-panel' : ''}`}>
      <div className="section-title-row simple-title-row">
        <h3>{title}</h3>
        {isStatureTableTitle(title) && <span className="stature-table-unit">Displayed in {statureUnitLongLabel(statureUnits)}</span>}
      </div>
      <div className="scroll-table">
        <table className={compactJackknife ? 'compact-vcvm-table' : undefined}>
          <caption className="sr-only">{title}</caption>
          <thead><tr>{columns.map((column) => <th scope="col" key={column}>{compactJackknife ? compactTableHeader(column) : statureAwareTableHeader(title, column, statureUnits)}</th>)}</tr></thead>
          <tbody>
            {rows.map((row, rowIndex) => {
              const outlierRow = allRowsAreOutliers || referenceRowHasOutlierFlag(row);
              return (
                <tr key={rowIndex} className={outlierRow ? 'reference-outlier-row' : undefined}>
                  {columns.map((column, columnIndex) => columnIndex === 0
                    ? <th scope="row" key={column}>{formatTableCell(title, column, row[column], statureUnits)}</th>
                    : <td key={column}>{formatTableCell(title, column, row[column], statureUnits)}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Warnings({ result }: { result: Record<string, any> }) {
  const [showAllCoverage, setShowAllCoverage] = useState(false);
  const [showAllRanges, setShowAllRanges] = useState(false);
  const inputWarnings = result.input_validation?.warnings ?? [];
  const coverageWarnings = inputWarnings.filter((warning: Record<string, any>) => warning.type === 'reference_coverage_limited_measurements');
  const advisoryWarnings = inputWarnings.filter((warning: Record<string, any>) => warning.type === 'sample_size_stepwise_advisory');
  const rangeWarnings = inputWarnings.filter((warning: Record<string, any>) => !['reference_coverage_limited_measurements', 'sample_size_stepwise_advisory'].includes(warning.type));
  const inputErrors = result.input_validation?.errors ?? [];
  const measurementCheckSkipped = Boolean(result.input_validation?.measurement_check_skipped);
  const outlierWarning = result.outliers?.warning;
  const representationWarning = result.case_representation_warning;
  const classificationSafeguard = result.classification_safeguard;
  const removedMeasurements = Array.isArray(result.measurements_removed) ? result.measurements_removed : [];
  const detectedCount = result.outliers?.detected_count ?? result.extended_results?.outliers?.detected_count;
  const excludedCount = result.outliers?.excluded_count ?? 0;
  const coverageDetails = coverageWarnings.flatMap((warning: Record<string, any>) => Array.isArray(warning.limiting_measurements) ? warning.limiting_measurements : []);
  if (!inputWarnings.length && !inputErrors.length && !outlierWarning && !representationWarning && !classificationSafeguard?.triggered && !measurementCheckSkipped && removedMeasurements.length === 0) return null;
  const visibleRanges = showAllRanges ? rangeWarnings : rangeWarnings.slice(0, 5);
  return (
    <section className="warning-panel warnings-dashboard">
      <div className="section-title-row"><h3>Warnings and checks</h3></div>
      <div className="warning-grid">
        {representationWarning && (
          <div className="warning-card error-card">
            <strong>Reference fit</strong>
            <p>{representationWarning.message}</p>
            <small>Best Typ. F: {formatProbability(representationWarning.best_typicality_f)} / Best Typ. χ²: {formatProbability(representationWarning.best_typicality_chi_square)}</small>
          </div>
        )}
        {classificationSafeguard?.triggered && (
          <div className="warning-card error-card">
            <strong>Classification safeguard</strong>
            <p>{classificationSafeguard.message}</p>
            <small>Best Typ. F: {formatProbability(classificationSafeguard.best_typicality_f)} / Threshold: {formatProbability(classificationSafeguard.threshold)}</small>
          </div>
        )}
        {measurementCheckSkipped && (
          <div className="warning-card">
            <strong>Measurement check skipped</strong>
            <p>Measurement range checking was skipped for this analysis.</p>
          </div>
        )}
        {removedMeasurements.length > 0 && (
          <div className="warning-card">
            <strong>Measurements removed</strong>
            <p>{removedMeasurements.join(', ')}</p>
            <small>Removed during DFA because the selected reference groups had insufficient complete sample sizes.</small>
          </div>
        )}
        {outlierWarning && (
          <div className="warning-card">
            <strong>Reference-sample outliers</strong>
            <p>{outlierWarning}</p>
            <small>{detectedCount ?? 0} detected / {excludedCount} excluded</small>
          </div>
        )}
        {advisoryWarnings.map((warning: Record<string, any>, index: number) => (
          <div className="warning-card advisory-card" key={`sample-advisory-${index}`}>
            <strong>Reference sample size</strong>
            <p>{warning.message}</p>
            <small>Advisory only; analysis settings were not changed automatically.</small>
          </div>
        ))}
        {coverageWarnings.length > 0 && (
          <div className="warning-card reference-coverage-card">
            <strong>Reference sample coverage</strong>
            {coverageWarnings.map((warning: Record<string, any>, index: number) => <p key={index}>{warning.message}</p>)}
            {coverageDetails.length > 0 && (
              <>
                <button type="button" className="warning-expand-button" onClick={() => setShowAllCoverage((value) => !value)} aria-expanded={showAllCoverage}>
                  {showAllCoverage ? 'Hide details' : `Show all details (${coverageDetails.length})`}
                </button>
                {showAllCoverage && (
                  <div className="coverage-detail-list">
                    {coverageDetails.map((detail: Record<string, any>, index: number) => (
                      <div className="coverage-detail-row" key={`${detail.variable ?? 'variable'}-${index}`}>
                        <strong>{detail.variable ?? '—'}</strong>
                        <span>Sparse groups: {(detail.groups_with_fewer_than_two_complete_rows ?? []).join(', ') || 'none'}</span>
                        <span>Groups restored if omitted: {(detail.groups_gained_if_omitted ?? []).join(', ') || 'none'}</span>
                        <span>Complete rows gained: {detail.complete_rows_gained_if_omitted ?? 0}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
        {rangeWarnings.length > 0 && (
          <div className="warning-card">
            <strong>Measurement range warnings</strong>
            {visibleRanges.map((warning: Record<string, any>, index: number) => <p key={index}>{warning.message}</p>)}
            {rangeWarnings.length > 5 && (
              <button type="button" className="warning-expand-button" onClick={() => setShowAllRanges((value) => !value)}>
                {showAllRanges ? 'Show less' : `Show all ${rangeWarnings.length}`}
              </button>
            )}
          </div>
        )}
        {inputErrors.length > 0 && (
          <div className="warning-card error-card">
            <strong>Input errors</strong>
            {inputErrors.map((error: Record<string, any>, index: number) => <p key={index}>{error.message}</p>)}
          </div>
        )}
      </div>
    </section>
  );
}

function ApiErrorPanel({ error, onOpenMeasurements, onOpenGroups }: { error: Record<string, any>; onOpenMeasurements?: () => void; onOpenGroups?: () => void }) {
  const detail = error.body?.detail ?? error.body;
  const inputValidation = detail?.input_validation;
  const groupSelection = detail?.group_selection;
  const stepwiseValidation = detail?.stepwise_validation;
  const referenceCoverage = detail?.reference_coverage;
  const inputErrors = inputValidation?.errors ?? [];
  const groupErrors = groupSelection?.errors ?? [];
  const hasStructuredDetails = inputErrors.length > 0 || groupErrors.length > 0 || Boolean(stepwiseValidation) || Boolean(referenceCoverage);
  return (
    <section className="warning-panel error-panel" role="alert" aria-labelledby="analysis-error-heading">
      <div className="section-title-row simple-title-row"><h3 id="analysis-error-heading">Analysis did not run</h3></div>
      {!hasStructuredDetails && <p>{error.message}</p>}
      {inputErrors.length > 0 && (
        <div className="error-detail-card">
          <strong>Measurement errors</strong>
          {inputErrors.map((item: Record<string, any>, index: number) => <p key={index}>{item.message}</p>)}
          {onOpenMeasurements && <button className="secondary" onClick={onOpenMeasurements}>Review Measurements</button>}
        </div>
      )}
      {groupErrors.length > 0 && (
        <div className="error-detail-card">
          <strong>Group-selection errors</strong>
          {groupErrors.map((item: Record<string, any>, index: number) => <p key={index}>{item.message}</p>)}
          {groupSelection?.invalid_groups?.length && <p>Invalid group(s): {groupSelection.invalid_groups.join(', ')}</p>}
          {onOpenGroups && <button className="secondary" onClick={onOpenGroups}>Review Groups</button>}
        </div>
      )}
      {stepwiseValidation && (
        <div className="error-detail-card">
          <strong>Stepwise selection</strong>
          <p>{detail?.message ?? error.message}</p>
        </div>
      )}
      {referenceCoverage && (
        <div className="error-detail-card">
          <strong>Reference sample coverage</strong>
          <p>{detail?.message ?? error.message}</p>
          {Array.isArray(referenceCoverage.warnings) && referenceCoverage.warnings.map((warning: Record<string, any>, index: number) => <p key={index}>{warning.message}</p>)}
        </div>
      )}
    </section>
  );
}

function EmptyPanel({ title, message }: { title: string; message: string }) {
  return <div className="empty-state"><h3>{title}</h3><p>{message}</p></div>;
}

function FD3StaturePlot({ graph, caseId, statureUnits }: { graph: Record<string, any>; caseId?: string; statureUnits: StatureUnits }) {
  const statureFactor = statureUnits === 'cm' ? INCH_TO_CM : 1;
  const referencePoints = Array.isArray(graph.reference_points) ? graph.reference_points : [];
  const lineRows = Array.isArray(graph.regression_line) ? graph.regression_line : [];
  const casePointRaw = Array.isArray(graph.case_point) ? graph.case_point[0] : graph.case_point;
  const casePoint = casePointRaw ?? {};
  const pointData = referencePoints
    .map((row: Record<string, any>) => ({ x: Number(row.x), y: Number(row.stature) * statureFactor }))
    .filter((row: {x: number; y: number}) => Number.isFinite(row.x) && Number.isFinite(row.y));
  const lineData = lineRows
    .map((row: Record<string, any>) => ({ x: Number(row.x), fit: Number(row.fit) * statureFactor, lower: Number(row.lower) * statureFactor, upper: Number(row.upper) * statureFactor }))
    .filter((row: {x: number; fit: number; lower: number; upper: number}) => Number.isFinite(row.x) && Number.isFinite(row.fit));
  const caseData = {
    x: Number(casePoint.x),
    y: Number(casePoint.stature) * statureFactor,
    lower: Number(casePoint.lower) * statureFactor,
    upper: Number(casePoint.upper) * statureFactor
  };
  if (!pointData.length || !lineData.length || !Number.isFinite(caseData.x) || !Number.isFinite(caseData.y)) {
    return <div className="empty-state compact-empty"><h3>No selected-equation graph data</h3><p>Reference points are not available for the selected stature equation.</p></div>;
  }
  const xs = [...pointData.map((p) => p.x), ...lineData.map((p) => p.x), caseData.x];
  const ys = [...pointData.map((p) => p.y), ...lineData.map((p) => p.lower), ...lineData.map((p) => p.upper), caseData.y];
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const padX = Math.max((maxX - minX) * 0.08, 1);
  const padY = Math.max((maxY - minY) * 0.12, 1);
  const lowX = Math.floor(minX - padX);
  const highX = Math.ceil(maxX + padX);
  const lowY = Math.floor(minY - padY);
  const highY = Math.ceil(maxY + padY);
  const scaleX = (x: number) => 62 + ((x - lowX) / Math.max(highX - lowX, 0.001)) * 596;
  const scaleY = (y: number) => 386 - ((y - lowY) / Math.max(highY - lowY, 0.001)) * 314;
  const pathFor = (rows: Array<Record<string, number>>, key: 'fit' | 'lower' | 'upper') => rows.map((row, index) => `${index === 0 ? 'M' : 'L'} ${scaleX(row.x)} ${scaleY(row[key])}`).join(' ');
  const title = `Predicted Forensic Stature (${statureUnitLongLabel(statureUnits)})${caseId ? ` for ${caseId}` : ''}`;
  const piPercent = graph.level ? `${Math.round(Number(graph.level) * 100)}% PI` : 'PI';
  const footer = `Predicted stature = ${caseData.lower.toFixed(1)} to ${caseData.upper.toFixed(1)} ${statureUnitAbbreviation(statureUnits)} (${piPercent})`;
  return (
    <div className="fd3-stature-graph-wrap">
      <svg id="fd3-stature-plot-svg" className="fd3-stature-plot" viewBox="0 0 720 440" role="img" aria-label="Fordisc-style selected-equation stature graph">
        <text className="plot-title" x="360" y="26" textAnchor="middle">{title}</text>
        <text className="plot-subtitle" x="360" y="46" textAnchor="middle">{graph.measurement} with {piPercent}; n = {graph.n}</text>
        <line className="axis-line" x1="62" x2="658" y1="386" y2="386" stroke="#b8c5cf" strokeWidth="1" />
        <line className="axis-line" x1="62" x2="62" y1="72" y2="386" stroke="#b8c5cf" strokeWidth="1" />
        {[lowX, Math.round((lowX + highX) / 2), highX].map((tick) => (
          <g key={`x-${tick}`}>
            <line className="tick-line" x1={scaleX(tick)} x2={scaleX(tick)} y1="72" y2="386" stroke="#dce5ed" strokeWidth="1" strokeDasharray="4 6" />
            <text className="tick-label" x={scaleX(tick)} y="406" textAnchor="middle">{tick}</text>
          </g>
        ))}
        {[lowY, Math.round((lowY + highY) / 2), highY].map((tick) => (
          <g key={`y-${tick}`}>
            <line className="tick-line" x1="62" x2="658" y1={scaleY(tick)} y2={scaleY(tick)} stroke="#dce5ed" strokeWidth="1" strokeDasharray="4 6" />
            <text className="tick-label" x="50" y={scaleY(tick) + 4} textAnchor="end">{tick}</text>
          </g>
        ))}
        <path className="prediction-band" d={pathFor(lineData, 'upper')} fill="none" stroke="#d62828" strokeWidth="2" strokeDasharray="4 7" />
        <path className="prediction-band" d={pathFor(lineData, 'lower')} fill="none" stroke="#d62828" strokeWidth="2" strokeDasharray="4 7" />
        <path className="regression-line" d={pathFor(lineData, 'fit')} fill="none" stroke="#222222" strokeWidth="2" />
        {pointData.map((point, index) => (
          <circle key={index} className="reference-point" cx={scaleX(point.x)} cy={scaleY(point.y)} r="3" fill="#1d4ed8" stroke="#1d4ed8" />
        ))}
        <polygon className="case-point" points={`${scaleX(caseData.x)},${scaleY(caseData.y)-9} ${scaleX(caseData.x)-8},${scaleY(caseData.y)+7} ${scaleX(caseData.x)+8},${scaleY(caseData.y)+7}`} fill="#111111" stroke="#f59e0b" strokeWidth="3" />
        <text className="axis-label" x="360" y="430" textAnchor="middle">{graph.x_label ?? graph.measurement}</text>
        <text className="axis-label rotate" x="-230" y="18" transform="rotate(-90)">Stature ({statureUnitAbbreviation(statureUnits)})</text>
      </svg>
      <div className="fd3-stature-footer">{footer}</div>
    </div>
  );
}

function StatureIntervalPlot({ rows, statureUnits }: { rows: Array<Record<string, any>>; statureUnits: StatureUnits }) {
  const statureFactor = statureUnits === 'cm' ? INCH_TO_CM : 1;
  const plotted = rows
    .map((row, index) => ({
      index,
      measurement: String(row.Measurement ?? row.measurement ?? `Estimate ${index + 1}`),
      point: Number(row.Point_Est ?? row.point_estimate ?? row.PointEstimate) * statureFactor,
      low: Number(row.L ?? row.lower ?? row.L_90) * statureFactor,
      high: Number(row.U ?? row.upper ?? row.U_90) * statureFactor,
      pi: row.PI ?? row.prediction_interval
    }))
    .filter((row) => Number.isFinite(row.point) && Number.isFinite(row.low) && Number.isFinite(row.high));
  if (!plotted.length) {
    return <div className="empty-state compact-empty"><h3>No stature plot data</h3><p>Run stature estimates to populate the plot.</p></div>;
  }
  const lows = plotted.map((row) => row.low);
  const highs = plotted.map((row) => row.high);
  const minX = Math.min(...lows);
  const maxX = Math.max(...highs);
  const pad = Math.max((maxX - minX) * 0.12, 1);
  const lowX = Math.floor(minX - pad);
  const highX = Math.ceil(maxX + pad);
  const chartHeight = Math.max(260, 56 + plotted.length * 34);
  const scaleX = (x: number) => 220 + ((x - lowX) / Math.max(highX - lowX, 0.001)) * 420;
  const labelFor = (measurement: string) => measurement.length > 28 ? `${measurement.slice(0, 26)}…` : measurement;
  return (
    <svg id="stature-plot-svg" className="stature-plot" viewBox={`0 0 700 ${chartHeight}`} role="img" aria-label="Stature estimate prediction intervals">
      <line className="axis-line" x1="220" x2="640" y1={chartHeight - 36} y2={chartHeight - 36} stroke="#d7e1ea" strokeWidth="1" />
      <text className="axis-label" x="640" y={chartHeight - 12} textAnchor="end">Estimated stature ({statureUnitLongLabel(statureUnits)})</text>
      {[lowX, Math.round((lowX + highX) / 2), highX].map((tick) => (
        <g key={tick}>
          <line className="tick-line" x1={scaleX(tick)} x2={scaleX(tick)} y1="28" y2={chartHeight - 36} stroke="#d7e1ea" strokeWidth="1" strokeDasharray="4 6" />
          <text className="tick-label" x={scaleX(tick)} y={chartHeight - 20} textAnchor="middle">{tick}</text>
        </g>
      ))}
      {plotted.map((row, i) => {
        const y = 36 + i * 34;
        return (
          <g key={`${row.measurement}-${i}`}>
            <text className="estimate-label" x="16" y={y + 4}>{labelFor(row.measurement)}</text>
            <line className="interval-line" x1={scaleX(row.low)} x2={scaleX(row.high)} y1={y} y2={y} stroke="#2b648d" strokeWidth="5" strokeLinecap="round" opacity="0.75" />
            <circle className="point-estimate" cx={scaleX(row.point)} cy={y} r="6" fill="#173f5a" stroke="#ffffff" strokeWidth="2" />
            <text className="estimate-value" x="650" y={y + 4}>{row.point.toFixed(1)}</text>
          </g>
        );
      })}
    </svg>
  );
}

// LaCroixColoR::Apricot leads the sequence. Together with the custom extension,
// 64 non-repeating slots cover the largest built-in 58-group Howells analysis.
const GRAPH_PALETTE = [
  '#D72000', '#EE6100', '#FFAD0A', '#1BB6AF', '#9093A2', '#132157',
  '#6F2DBD', '#009E73', '#D81B60', '#56B4E9', '#8C564B', '#8BD646',
  '#CC79A7', '#004D40', '#7A9132', '#E76F51', '#0072B2', '#5C363A',
  '#A78BFA', '#2CA25F', '#A64B00', '#364FC7', '#782717', '#D276E5',
  '#53246B', '#F4C567', '#B83D8F', '#0A3385', '#11E4E4', '#713091',
  '#B4980E', '#5EC9A6', '#7538F0', '#F467DC', '#4B1FA3', '#D68585',
  '#5EC95E', '#B338F0', '#F0D138', '#914130', '#A34B1F', '#C95E70',
  '#6B2424', '#371778', '#A31F77', '#D6D685', '#9DE411', '#A31FA3',
  '#67DCF4', '#6B246B', '#7ACE27', '#1FA31F', '#119DE4', '#523DB8',
  '#3DB83D', '#ACDD4B', '#B227CE', '#536B24', '#9627CE', '#851E0A',
  '#ADE576', '#0E29B4', '#E49D11', '#85A0D6'
];

type GraphColorMap = ReadonlyMap<string, string>;

function normalizeGraphLabel(label: string) {
  return String(label ?? '').trim().toUpperCase();
}

function orderedUniqueGraphLabels(labels: string[]) {
  const seen = new Set<string>();
  return labels.map((label) => String(label ?? '').trim()).filter((label) => {
    const normalized = normalizeGraphLabel(label);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function graphPaletteColorAt(index: number) {
  if (index < GRAPH_PALETTE.length) return GRAPH_PALETTE[index];
  const hue = Math.round((17 + index * 137.508) % 360);
  const saturation = 66 + (index % 3) * 8;
  const lightness = 36 + (Math.floor(index / 3) % 3) * 10;
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

function buildGraphColorMap(labels: string[]): GraphColorMap {
  return new Map(orderedUniqueGraphLabels(labels).map((label, index) => [normalizeGraphLabel(label), graphPaletteColorAt(index)]));
}

function stableGraphLabelHash(label: string) {
  const cleaned = String(label ?? '').trim().toUpperCase();
  let hash = 5381;
  for (let i = 0; i < cleaned.length; i++) hash = ((hash << 5) + hash) ^ cleaned.charCodeAt(i);
  return Math.abs(hash);
}

function graphColorFor(label: string, _module?: ModuleId, colorMap?: GraphColorMap) {
  const cleaned = normalizeGraphLabel(label);
  const mapped = colorMap?.get(cleaned);
  if (mapped) return mapped;
  return GRAPH_PALETTE[stableGraphLabelHash(cleaned) % GRAPH_PALETTE.length];
}

function canonicalAxisNumber(axisKey: string) {
  const match = String(axisKey).match(/(\d+)$/);
  return match ? Number(match[1]) : 1;
}

function canonicalAxisDisplayLabel(axisKey: string, proportions: any[] = []) {
  const axis = canonicalAxisNumber(axisKey);
  const proportion = Number(proportions[axis - 1]);
  return Number.isFinite(proportion) ? `CV${axis} (${(proportion * 100).toFixed(2)}%)` : `CV${axis}`;
}

function niceTickValues(minimum: number, maximum: number, targetCount = 6) {
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) return [] as number[];
  if (minimum === maximum) return [minimum];
  const span = Math.abs(maximum - minimum);
  const rough = span / Math.max(targetCount - 1, 1);
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(rough, Number.EPSILON)));
  const residual = rough / magnitude;
  const niceResidual = residual >= 5 ? 5 : residual >= 2 ? 2 : 1;
  const step = niceResidual * magnitude;
  const start = Math.ceil(minimum / step) * step;
  const end = Math.floor(maximum / step) * step;
  const ticks: number[] = [];
  for (let value = start; value <= end + step * 0.25; value += step) ticks.push(Number(value.toPrecision(12)));
  if (ticks.length < 2) return [minimum, maximum];
  return ticks;
}

function formatGraphTick(value: number) {
  const absolute = Math.abs(value);
  if (absolute >= 100 || (absolute > 0 && absolute < 0.01)) return value.toExponential(1);
  if (absolute >= 10) return value.toFixed(1);
  return value.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

function estimateSvgLabelWidth(value: string, fontSize = 14, heavy = false) {
  const baseWidth = Array.from(String(value ?? '')).reduce((total, character) => {
    if (character === ' ') return total + 3.8;
    if (/[MW@%]/.test(character)) return total + 10.2;
    if (/[ilI1.,'`]/.test(character)) return total + 4.3;
    return total + 7.7;
  }, 0);
  return Math.ceil(baseWidth * (fontSize / 14) * (heavy ? 1.06 : 1));
}

function svgLabelColumnLeft(labels: string[], minimum = 104, maximum = 230) {
  const widestLabel = Math.max(0, ...labels.map((label) => estimateSvgLabelWidth(label, 14, true)));
  return Math.min(maximum, Math.max(minimum, widestLabel + 24));
}

function ternaryVerticesForLabels(labels: string[]) {
  const widestLabel = Math.max(0, ...labels.map((label) => estimateSvgLabelWidth(label, 14, true)));
  const sideMargin = Math.min(148, Math.max(104, Math.ceil(widestLabel / 2) + 14));
  return [{ x: sideMargin, y: 468 }, { x: 700 - sideMargin, y: 468 }, { x: 350, y: 64 }];
}

function TwoGroupHistogramPlot({ referencePoints, casePoint, binWidth, module, colorMap, caseId }: { referencePoints: Array<Record<string, any>>; casePoint: Record<string, any> | null; binWidth: number; module: ModuleId; colorMap: GraphColorMap; caseId?: string }) {
  const points = referencePoints
    .map((point, index) => ({ id: String(point.RecID ?? point.ID ?? index), group: String(point.Pop ?? point.group ?? '?'), score: Number(point.LD1) }))
    .filter((point) => Number.isFinite(point.score));
  const groups = Array.from(new Set(points.map((point) => point.group))).slice(0, 2);
  const caseScore = Number(casePoint?.LD1);
  const hasCaseScore = Number.isFinite(caseScore);
  const width = Number.isFinite(binWidth) && binWidth > 0 ? binWidth : 0.5;
  if (groups.length !== 2 || !points.length) {
    return <div className="empty-state compact-empty"><h3>No two-group histogram data</h3><p>Two groups and DF scores are required for the two-group histogram.</p></div>;
  }
  const scores = [...points.map((point) => point.score), ...(hasCaseScore ? [caseScore] : [])];
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const start = Math.floor(minScore / width) * width - width;
  const end = Math.ceil(maxScore / width) * width + width;
  const bins: number[] = [];
  for (let edge = start; edge <= end + width * 0.5; edge += width) bins.push(Number(edge.toFixed(6)));
  const groupTotals = new Map(groups.map((group) => [group, points.filter((point) => point.group === group).length]));
  const bars: Array<{ group: string; binStart: number; binEnd: number; proportion: number; count: number; binIndex: number; groupIndex: number }> = [];
  bins.slice(0, -1).forEach((binStart, binIndex) => {
    const binEnd = bins[binIndex + 1];
    groups.forEach((group, groupIndex) => {
      const count = points.filter((point) => point.group === group && point.score >= binStart && point.score < binEnd).length;
      const total = Math.max(groupTotals.get(group) ?? 1, 1);
      bars.push({ group, binStart, binEnd, proportion: count / total, count, binIndex, groupIndex });
    });
  });
  const maxProp = Math.max(0.05, ...bars.map((bar) => bar.proportion));
  const yMax = Math.ceil((maxProp + 0.02) * 10) / 10;
  const chart = { left: 62, top: 72, width: 560, height: 272 };
  const scaleX = (x: number) => chart.left + ((x - start) / Math.max(end - start, 0.001)) * chart.width;
  const scaleY = (y: number) => chart.top + chart.height - (y / yMax) * chart.height;
  const barGap = Math.max(1, (scaleX(start + width) - scaleX(start)) * 0.08);
  const barWidth = Math.max(2, ((scaleX(start + width) - scaleX(start)) - barGap * 3) / 2);
  const caseX = hasCaseScore ? scaleX(caseScore) : null;
  const tickValues = niceTickValues(start, end, 6);
  return (
    <svg id="canonical-plot-svg" className="two-group-histogram-plot" viewBox="0 0 700 420" role="img" aria-label="Two-group discriminant function histogram">
      <text className="plot-title" x="350" y="28" textAnchor="middle">Two-group discriminant function results{caseId ? ` for ${caseId}` : ''}</text>
      <line x1={chart.left} x2={chart.left + chart.width} y1={chart.top + chart.height} y2={chart.top + chart.height} stroke="#222" strokeWidth="1.2" />
      <line x1={chart.left} x2={chart.left} y1={chart.top} y2={chart.top + chart.height} stroke="#222" strokeWidth="1.2" />
      {[0, yMax / 2, yMax].map((tick) => (
        <g key={`y-${tick}`}>
          <line x1={chart.left - 5} x2={chart.left} y1={scaleY(tick)} y2={scaleY(tick)} stroke="#222" />
          <text x={chart.left - 10} y={scaleY(tick) + 4} textAnchor="end" className="tick-label">{tick.toFixed(2).replace(/0$/, '')}</text>
        </g>
      ))}
      {tickValues.map((tick) => (
        <g key={`x-${tick}`}>
          <line x1={scaleX(tick)} x2={scaleX(tick)} y1={chart.top + chart.height} y2={chart.top + chart.height + 5} stroke="#222" />
          <text x={scaleX(tick)} y={chart.top + chart.height + 22} textAnchor="middle" className="tick-label">{tick.toFixed(1)}</text>
        </g>
      ))}
      {start < 0 && end > 0 && (
        <line x1={scaleX(0)} x2={scaleX(0)} y1={chart.top} y2={chart.top + chart.height} stroke="#111827" strokeWidth="2.5" />
      )}
      {bars.filter((bar) => bar.count > 0).map((bar) => {
        const x = scaleX(bar.binStart) + barGap + bar.groupIndex * (barWidth + barGap);
        const y = scaleY(bar.proportion);
        return <rect key={`${bar.group}-${bar.binStart}`} x={x} y={y} width={barWidth} height={chart.top + chart.height - y} fill={graphColorFor(bar.group, module, colorMap)} fillOpacity="0.95" />;
      })}
      {caseX !== null && (<>
        <line x1={caseX} x2={caseX} y1={chart.top} y2={chart.top + chart.height} stroke="#111" strokeWidth="2" strokeDasharray="5 5" />
        <rect x={caseX - 8} y={chart.top + chart.height - 22} width="16" height="16" fill="#ffffff" stroke="#111" />
        <text x={caseX} y={chart.top + chart.height - 9} textAnchor="middle" className="case-marker-label">X</text>
      </>)}
      <text x={20} y={chart.top - 10} className="axis-label">Proportion</text>
      <text x={350} y="400" textAnchor="middle" className="axis-label">{hasCaseScore ? `DF Score = ${caseScore.toFixed(2)}; ` : ''}sectioning point = 0</text>
      {groups.map((group, index) => (
        <g key={group} transform={`translate(${index === 0 ? 62 : 360}, 44)`}>
          <rect width="10" height="10" fill={graphColorFor(group, module, colorMap)} />
          <text x="18" y="10" className="legend-label">{group} ({groupTotals.get(group) ?? 0})</text>
        </g>
      ))}
    </svg>
  );
}

function CanonicalPlot({
  centroids,
  referencePoints,
  showReferencePoints,
  casePoint,
  xAxis,
  yAxis,
  showLabels,
  showAxes,
  showCentroids,
  showEllipses,
  visibleGroupLabels,
  module,
  colorMap,
  eigenvalueProportions,
  orientationMultiplier
}: {
  centroids: Array<Record<string, any>>;
  referencePoints: Array<Record<string, any>>;
  showReferencePoints: boolean;
  casePoint: Record<string, any> | null;
  xAxis: string;
  yAxis: string;
  showLabels: boolean;
  showAxes: boolean;
  showCentroids: boolean;
  showEllipses: boolean;
  visibleGroupLabels: string[];
  module: ModuleId;
  colorMap: GraphColorMap;
  eigenvalueProportions: any[];
  orientationMultiplier: number;
}) {
  const centroidPoints = centroids.map((point) => ({
    label: String(point.Pop ?? point.group ?? '?'),
    x: Number(point[xAxis] ?? 0) * orientationMultiplier,
    y: Number(point[yAxis] ?? 0) * orientationMultiplier
  })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  const referencePlotPoints = referencePoints.map((point, index) => ({
    id: String(point.RecID ?? point.ID ?? point.id ?? index),
    label: String(point.Pop ?? point.group ?? '?'),
    x: Number(point[xAxis] ?? 0) * orientationMultiplier,
    y: Number(point[yAxis] ?? 0) * orientationMultiplier
  })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  const casePlotPoint = casePoint ? {
    label: 'Case',
    x: Number(casePoint[xAxis] ?? 0) * orientationMultiplier,
    y: Number(casePoint[yAxis] ?? 0) * orientationMultiplier
  } : null;
  const allPoints = [
    ...referencePlotPoints,
    ...centroidPoints,
    ...(casePlotPoint && Number.isFinite(casePlotPoint.x) && Number.isFinite(casePlotPoint.y) ? [casePlotPoint] : [])
  ];
  if (!allPoints.length) {
    return <div className="empty-state compact-empty"><h3>No graph points visible</h3><p>Select at least one group or graph layer in Graph controls.</p></div>;
  }
  const xs = allPoints.map((point) => point.x);
  const ys = allPoints.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const padX = Math.max((maxX - minX) * 0.15, 0.5);
  const padY = Math.max((maxY - minY) * 0.15, 0.5);
  const lowX = minX - padX;
  const highX = maxX + padX;
  const lowY = minY - padY;
  const highY = maxY + padY;
  const scaleX = (x: number) => 52 + ((x - lowX) / Math.max(highX - lowX, 0.001)) * 500;
  const scaleY = (y: number) => 332 - ((y - lowY) / Math.max(highY - lowY, 0.001)) * 260;
  const xTicks = niceTickValues(lowX, highX, 6);
  const yTicks = niceTickValues(lowY, highY, 6);
  const zeroXVisible = lowX < 0 && highX > 0;
  const zeroYVisible = lowY < 0 && highY > 0;
  const ellipseSourcePoints = referencePlotPoints.filter((point) => visibleGroupLabels.includes(point.label));
  const ellipses = buildCanonicalEllipses(ellipseSourcePoints, scaleX, scaleY, module, colorMap);
  return (
    <svg id="canonical-plot-svg" className="canonical-plot canonical-plot-enhanced" viewBox="0 0 620 385" role="img" aria-label="Canonical scatterplot">
      {showAxes && (
        <>
          {xTicks.map((tick) => (
            <g key={`x-grid-${tick}`}>
              <line className="plot-grid-line" x1={scaleX(tick)} x2={scaleX(tick)} y1="72" y2="332" />
              <line className="plot-tick" x1={scaleX(tick)} x2={scaleX(tick)} y1="332" y2="338" />
              <text className="plot-tick-label" x={scaleX(tick)} y="352" textAnchor="middle">{formatGraphTick(tick)}</text>
            </g>
          ))}
          {yTicks.map((tick) => (
            <g key={`y-grid-${tick}`}>
              <line className="plot-grid-line" x1="52" x2="552" y1={scaleY(tick)} y2={scaleY(tick)} />
              <line className="plot-tick" x1="46" x2="52" y1={scaleY(tick)} y2={scaleY(tick)} />
              <text className="plot-tick-label" x="42" y={scaleY(tick) + 4} textAnchor="end">{formatGraphTick(tick)}</text>
            </g>
          ))}
          <line className="plot-axis" x1="52" x2="552" y1="332" y2="332" stroke="#8ca0b3" strokeWidth="1.2" />
          <line className="plot-axis" x1="52" x2="52" y1="72" y2="332" stroke="#8ca0b3" strokeWidth="1.2" />
          {zeroXVisible && <line className="zero-axis" x1={scaleX(0)} x2={scaleX(0)} y1="72" y2="332" stroke="#aebdca" strokeWidth="1.2" strokeDasharray="4 5" />}
          {zeroYVisible && <line className="zero-axis" x1="52" x2="552" y1={scaleY(0)} y2={scaleY(0)} stroke="#aebdca" strokeWidth="1.2" strokeDasharray="4 5" />}
          <text className="axis-label" x="552" y="374" textAnchor="end" fill="#22384b">{canonicalAxisDisplayLabel(xAxis, eigenvalueProportions)}</text>
          <text className="axis-label vertical-axis-label" x="16" y="202" textAnchor="middle" transform="rotate(-90 16 202)" fill="#22384b">{canonicalAxisDisplayLabel(yAxis, eigenvalueProportions)}</text>
        </>
      )}
      {showEllipses && ellipses.map((ellipse) => (
        <ellipse
          key={`ellipse-${ellipse.label}`}
          className="population-ellipse"
          cx={ellipse.cx}
          cy={ellipse.cy}
          rx={ellipse.rx}
          ry={ellipse.ry}
          transform={`rotate(${ellipse.angle}, ${ellipse.cx}, ${ellipse.cy})`}
          fill={ellipse.color}
          fillOpacity="0.08"
          stroke={ellipse.color}
          strokeWidth="1.4"
          strokeOpacity="0.65"
        />
      ))}
      {showReferencePoints && referencePlotPoints.map((point) => {
        const color = graphColorFor(point.label, module, colorMap);
        return (
          <circle
            key={`ref-${point.id}-${point.label}`}
            className="reference-score-point"
            cx={scaleX(point.x)}
            cy={scaleY(point.y)}
            r="1.9"
            fill={color}
            fillOpacity="0.55"
            stroke={color}
            strokeWidth="0.35"
          />
        );
      })}
      {showCentroids && centroidPoints.map((point) => {
        const color = graphColorFor(point.label, module, colorMap);
        const centroidX = scaleX(point.x);
        const labelOnLeft = centroidX > 310;
        return (
          <g key={`centroid-${point.label}`} transform={`translate(${centroidX}, ${scaleY(point.y)})`}>
            <rect className="centroid-marker" x="-5" y="-5" width="10" height="10" rx="2" fill={color} fillOpacity="0.78" stroke="#ffffff" strokeWidth="1.4" />
            {showLabels && <text className="centroid-label" x={labelOnLeft ? -11 : 11} y="4" textAnchor={labelOnLeft ? 'end' : 'start'} fill="#22384b">{point.label}</text>}
          </g>
        );
      })}
      {casePlotPoint && Number.isFinite(casePlotPoint.x) && Number.isFinite(casePlotPoint.y) && (
        <g transform={`translate(${scaleX(casePlotPoint.x)}, ${scaleY(casePlotPoint.y)})`}>
          <path className="case-canonical-point" d="M 0 -10 L 10 0 L 0 10 L -10 0 Z" fill="#111827" stroke="#facc15" strokeWidth="3" />
          <text className="case-canonical-label" x="13" y="5" fill="#22384b">Case</text>
        </g>
      )}
    </svg>
  );
}

function buildCanonicalEllipses(
  points: Array<{ label: string; x: number; y: number }>,
  scaleX: (x: number) => number,
  scaleY: (y: number) => number,
  module: ModuleId,
  colorMap: GraphColorMap
) {
  const byGroup = new Map<string, Array<{ x: number; y: number }>>();
  for (const point of points) {
    if (!byGroup.has(point.label)) byGroup.set(point.label, []);
    byGroup.get(point.label)?.push({ x: point.x, y: point.y });
  }
  const result: Array<{ label: string; cx: number; cy: number; rx: number; ry: number; angle: number; color: string }> = [];
  byGroup.forEach((groupPoints, label) => {
    if (groupPoints.length < 3) return;
    const n = groupPoints.length;
    const meanX = groupPoints.reduce((sum, point) => sum + point.x, 0) / n;
    const meanY = groupPoints.reduce((sum, point) => sum + point.y, 0) / n;
    let sxx = 0;
    let syy = 0;
    let sxy = 0;
    for (const point of groupPoints) {
      const dx = point.x - meanX;
      const dy = point.y - meanY;
      sxx += dx * dx;
      syy += dy * dy;
      sxy += dx * dy;
    }
    sxx /= Math.max(n - 1, 1);
    syy /= Math.max(n - 1, 1);
    sxy /= Math.max(n - 1, 1);
    const trace = sxx + syy;
    const determinantTerm = Math.sqrt(Math.max(((sxx - syy) / 2) ** 2 + sxy ** 2, 0));
    const lambda1 = Math.max(trace / 2 + determinantTerm, 0);
    const lambda2 = Math.max(trace / 2 - determinantTerm, 0);
    if (!Number.isFinite(lambda1) || !Number.isFinite(lambda2) || lambda1 <= 0) return;
    const angleRadians = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const majorX = meanX + Math.cos(angleRadians) * Math.sqrt(lambda1) * 2;
    const majorY = meanY + Math.sin(angleRadians) * Math.sqrt(lambda1) * 2;
    const minorX = meanX + Math.cos(angleRadians + Math.PI / 2) * Math.sqrt(lambda2) * 2;
    const minorY = meanY + Math.sin(angleRadians + Math.PI / 2) * Math.sqrt(lambda2) * 2;
    const cx = scaleX(meanX);
    const cy = scaleY(meanY);
    const rx = Math.hypot(scaleX(majorX) - cx, scaleY(majorY) - cy);
    const ry = Math.hypot(scaleX(minorX) - cx, scaleY(minorY) - cy);
    if (!Number.isFinite(rx) || !Number.isFinite(ry) || rx < 2 || ry < 2) return;
    result.push({
      label,
      cx,
      cy,
      rx,
      ry,
      angle: -angleRadians * 180 / Math.PI,
      color: graphColorFor(label, module, colorMap)
    });
  });
  return result;
}


type PairwiseMatrix = { labels: string[]; distances: Map<string, Map<string, number>> };

function normalizePairwiseMatrix(rows: Array<Record<string, any>>): PairwiseMatrix {
  const labels = rows.map((row) => String(row.Group ?? row.Pop ?? row.group ?? '')).filter(Boolean);
  const distances = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const from = String(row.Group ?? row.Pop ?? row.group ?? '');
    if (!from) continue;
    if (!distances.has(from)) distances.set(from, new Map<string, number>());
    for (const label of labels) {
      const raw = row[label];
      const value = Number(raw);
      if (Number.isFinite(value)) distances.get(from)?.set(label, value);
    }
  }
  for (const a of labels) {
    if (!distances.has(a)) distances.set(a, new Map<string, number>());
    for (const b of labels) {
      const ab = distances.get(a)?.get(b);
      const ba = distances.get(b)?.get(a);
      if (Number.isFinite(ab)) distances.get(b)?.set(a, Number(ab));
      else if (Number.isFinite(ba)) distances.get(a)?.set(b, Number(ba));
      else if (a === b) distances.get(a)?.set(b, 0);
    }
  }
  return { labels, distances };
}

function buildCentroidSquaredDistanceMatrix(centroids: Array<Record<string, any>>): PairwiseMatrix {
  const labels = centroids.map((row) => String(row.Pop ?? row.group ?? '')).filter(Boolean);
  const axisKeys = Array.from(new Set(centroids.flatMap((row) => Object.keys(row).filter((key) => /^LD\d+$/i.test(key))))).sort((a, b) => Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, '')));
  const byLabel = new Map(centroids.map((row) => [String(row.Pop ?? row.group ?? ''), row]));
  const distances = new Map<string, Map<string, number>>();
  for (const from of labels) {
    distances.set(from, new Map<string, number>());
    const a = byLabel.get(from) ?? {};
    for (const to of labels) {
      const b = byLabel.get(to) ?? {};
      const total = axisKeys.reduce((sum, key) => {
        const av = Number(a[key]);
        const bv = Number(b[key]);
        return Number.isFinite(av) && Number.isFinite(bv) ? sum + (av - bv) ** 2 : sum;
      }, 0);
      distances.get(from)?.set(to, total);
    }
  }
  return { labels, distances };
}

function DendrogramPlot({ matrixRows, centroids, module, colorMap }: { matrixRows: Array<Record<string, any>>; centroids?: Array<Record<string, any>>; module: ModuleId; colorMap: GraphColorMap }) {
  const matrix = centroids && centroids.length >= 3 ? buildCentroidSquaredDistanceMatrix(centroids) : normalizePairwiseMatrix(matrixRows);
  if (matrix.labels.length < 3) return <div className="empty-state compact-empty"><h3>No dendrogram data</h3><p>At least three groups are required.</p></div>;
  const tree = buildAverageLinkageTree(matrix.labels, matrix.distances);
  const leaves = collectClusterLeaves(tree);
  const chartLeft = svgLabelColumnLeft(leaves);
  const chart = { left: chartLeft, right: 650, top: 44, bottom: 315, width: 650 - chartLeft, height: 271 };
  const labelX = chart.left - 12;
  const yStep = leaves.length > 1 ? chart.height / (leaves.length - 1) : chart.height;
  const leafY = new Map(leaves.map((label, index) => [label, chart.top + index * yStep]));
  const maxHeight = Math.max(tree.height, 1);
  const xFor = (height: number) => chart.left + (height / maxHeight) * chart.width;
  const paths: string[] = [];
  const drawNode = (node: ClusterNode): { x: number; y: number } => {
    if (!node.children.length) return { x: chart.left, y: leafY.get(node.labels[0]) ?? chart.top };
    const left = drawNode(node.children[0]);
    const right = drawNode(node.children[1]);
    const x = xFor(node.height);
    paths.push(`<line x1="${left.x.toFixed(2)}" y1="${left.y.toFixed(2)}" x2="${x.toFixed(2)}" y2="${left.y.toFixed(2)}" stroke="#111" stroke-width="1.55" stroke-linecap="square" shape-rendering="crispEdges"/>`);
    paths.push(`<line x1="${right.x.toFixed(2)}" y1="${right.y.toFixed(2)}" x2="${x.toFixed(2)}" y2="${right.y.toFixed(2)}" stroke="#111" stroke-width="1.55" stroke-linecap="square" shape-rendering="crispEdges"/>`);
    paths.push(`<line x1="${x.toFixed(2)}" y1="${Math.min(left.y, right.y).toFixed(2)}" x2="${x.toFixed(2)}" y2="${Math.max(left.y, right.y).toFixed(2)}" stroke="#111" stroke-width="1.55" stroke-linecap="square" shape-rendering="crispEdges"/>`);
    return { x, y: (left.y + right.y) / 2 };
  };
  drawNode(tree);
  const ticks = [0, maxHeight / 3, maxHeight * 2 / 3, maxHeight];
  return (
    <svg id="dendrogram-plot-svg" className="fd4-dendrogram-plot" viewBox="0 0 700 405" role="img" aria-label="Dendrogram of group relationships">
      <text x="350" y="24" textAnchor="middle" className="plot-title">Dendrogram of Group Relationships</text>
      <g className="dendrogram-lines" stroke="#111" strokeWidth="1.55" strokeLinecap="square" shapeRendering="crispEdges" dangerouslySetInnerHTML={{ __html: paths.join('') }} />
      {leaves.map((label) => <text key={label} x={labelX} y={(leafY.get(label) ?? 0) + 5} textAnchor="end" className="dendrogram-label" fill={graphColorFor(label, module, colorMap)}>{label}</text>)}
      <line x1={chart.left} x2={chart.right} y1="340" y2="340" className="dendrogram-axis" />
      {ticks.map((tick) => <g key={`tick-${tick}`}><line x1={xFor(tick)} x2={xFor(tick)} y1="336" y2="344" className="dendrogram-axis"/><text x={xFor(tick)} y="362" textAnchor="middle" className="tick-label">{tick.toFixed(tick < 10 ? 1 : 0)}</text></g>)}
      <text x={(chart.left + chart.right) / 2} y="390" textAnchor="middle" className="axis-label">Mahalanobis Distance</text>
    </svg>
  );
}

type ClusterNode = { labels: string[]; height: number; children: ClusterNode[] };

function collectClusterLeaves(node: ClusterNode): string[] {
  if (!node.children.length) return [...node.labels];
  return node.children.flatMap((child) => collectClusterLeaves(child));
}

function buildAverageLinkageTree(labels: string[], distances: Map<string, Map<string, number>>): ClusterNode {
  let clusters: ClusterNode[] = labels.map((label) => ({ labels: [label], height: 0, children: [] }));
  const pairDistance = (a: ClusterNode, b: ClusterNode) => {
    const values: number[] = [];
    for (const la of a.labels) for (const lb of b.labels) {
      const value = distances.get(la)?.get(lb) ?? distances.get(lb)?.get(la);
      if (Number.isFinite(value)) values.push(Number(value));
    }
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : Number.POSITIVE_INFINITY;
  };
  while (clusters.length > 1) {
    let bestI = 0;
    let bestJ = 1;
    let bestDistance = pairDistance(clusters[0], clusters[1]);
    for (let i = 0; i < clusters.length; i++) for (let j = i + 1; j < clusters.length; j++) {
      const distance = pairDistance(clusters[i], clusters[j]);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestI = i;
        bestJ = j;
      }
    }
    const first = clusters[bestI];
    const second = clusters[bestJ];
    const childHeight = Math.max(first.height, second.height);
    const mergeHeight = Number.isFinite(bestDistance) ? Math.max(bestDistance, childHeight) : childHeight;
    const merged: ClusterNode = { labels: [...first.labels, ...second.labels], height: mergeHeight, children: [first, second] };
    clusters = clusters.filter((_, index) => index !== bestI && index !== bestJ).concat(merged);
  }
  return clusters[0];
}

function TernaryPlot({ posteriorRows, casePosterior, groups, module, colorMap }: { posteriorRows: Array<Record<string, any>>; casePosterior: Record<string, any> | null; groups: string[]; module: ModuleId; colorMap: GraphColorMap }) {
  if (groups.length !== 3) return <div className="empty-state compact-empty"><h3>Ternary plot unavailable</h3><p>Select exactly three visible groups.</p></div>;
  const vertices = ternaryVerticesForLabels(groups);
  const normalize = (row: Record<string, any>) => {
    const probs = groups.map((group) => Math.max(0, Number(row[group] ?? 0)));
    const sum = probs.reduce((acc, value) => acc + value, 0);
    if (!Number.isFinite(sum) || sum <= 0) return null;
    return probs.map((value) => value / sum);
  };
  const pointFor = (weights: number[]) => ({
    x: weights[0] * vertices[0].x + weights[1] * vertices[1].x + weights[2] * vertices[2].x,
    y: weights[0] * vertices[0].y + weights[1] * vertices[1].y + weights[2] * vertices[2].y
  });
  const points = posteriorRows
    .filter((row) => groups.includes(String(row.Pop ?? row.group ?? '')))
    .map((row, index) => {
      const weights = normalize(row);
      if (!weights) return null;
      const p = pointFor(weights);
      return { id: String(row.RecID ?? index), group: String(row.Pop ?? row.group ?? '?'), x: p.x, y: p.y };
    })
    .filter(Boolean) as Array<{ id: string; group: string; x: number; y: number }>;
  const caseWeights = casePosterior ? normalize(casePosterior) : null;
  const casePoint = caseWeights ? pointFor(caseWeights) : null;
  return (
    <svg id="ternary-plot-svg" className="fd4-ternary-plot" viewBox="0 0 700 530" role="img" aria-label="Ternary posterior probability plot">
      <polygon points={vertices.map((v) => `${v.x},${v.y}`).join(' ')} fill="#ffffff" stroke="#111" strokeWidth="1.6" />
      {points.map((point) => <circle key={`${point.id}-${point.group}`} cx={point.x} cy={point.y} r="3.2" fill={graphColorFor(point.group, module, colorMap)} fillOpacity="0.9" />)}
      {casePoint && <g transform={`translate(${casePoint.x}, ${casePoint.y})`}><path d="M 0 -10 L 10 0 L 0 10 L -10 0 Z" fill="#111827" stroke="#facc15" strokeWidth="2"/><text x="13" y="5" className="case-canonical-label">Case</text></g>}
      {groups.map((group, index) => <text key={group} x={vertices[index].x} y={vertices[index].y + (index === 2 ? -14 : 30)} textAnchor="middle" className="ternary-vertex-label" fill={graphColorFor(group, module, colorMap)}>{group}</text>)}
      <text x="350" y="28" textAnchor="middle" className="plot-title">Ternary Plot</text>
    </svg>
  );
}

function Canonical3DPlot({ centroids, referencePoints, casePoint, module, colorMap, orientationMultiplier }: { centroids: Array<Record<string, any>>; referencePoints: Array<Record<string, any>>; casePoint: Record<string, any> | null; module: ModuleId; colorMap: GraphColorMap; orientationMultiplier: number }) {
  const DEFAULT_3D_VIEW = { angleX: 28, angleZ: -38, zoom: 0.74 };
  const [angleX, setAngleX] = useState(DEFAULT_3D_VIEW.angleX);
  const [angleZ, setAngleZ] = useState(DEFAULT_3D_VIEW.angleZ);
  const [zoom, setZoom] = useState(DEFAULT_3D_VIEW.zoom);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingViewRef = useRef<{ angleX: number; angleZ: number; zoom: number } | null>(null);
  const dragState = useRef<{ x: number; y: number; angleX: number; angleZ: number; zoom: number; mode: 'rotate' | 'zoom'; pointerId?: number } | null>(null);
  const points = referencePoints.map((point, index) => ({ id: String(point.RecID ?? index), group: String(point.Pop ?? point.group ?? '?'), x: Number(point.LD1) * orientationMultiplier, y: Number(point.LD2) * orientationMultiplier, z: Number(point.LD3) * orientationMultiplier, kind: 'reference' })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z));
  const centroidPoints = centroids.map((point) => ({ id: String(point.Pop ?? point.group ?? '?'), group: String(point.Pop ?? point.group ?? '?'), x: Number(point.LD1) * orientationMultiplier, y: Number(point.LD2) * orientationMultiplier, z: Number(point.LD3) * orientationMultiplier, kind: 'centroid' })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z));
  const case3d = casePoint ? { id: 'case', group: 'Case', x: Number(casePoint.LD1) * orientationMultiplier, y: Number(casePoint.LD2) * orientationMultiplier, z: Number(casePoint.LD3) * orientationMultiplier, kind: 'case' } : null;
  const all = [...points, ...centroidPoints, ...(case3d && Number.isFinite(case3d.x) && Number.isFinite(case3d.y) && Number.isFinite(case3d.z) ? [case3d] : [])];

  const clampZoom = (value: number) => Math.max(0.34, Math.min(2.35, value));
  const clampAngleX = (value: number) => Math.max(-85, Math.min(85, value));
  const normalizeAngleZ = (value: number) => ((value + 540) % 360) - 180;
  const scheduleViewUpdate = (next: { angleX: number; angleZ: number; zoom: number }) => {
    pendingViewRef.current = {
      angleX: clampAngleX(next.angleX),
      angleZ: normalizeAngleZ(next.angleZ),
      zoom: clampZoom(next.zoom)
    };
    if (rafRef.current !== null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      const pending = pendingViewRef.current;
      rafRef.current = null;
      pendingViewRef.current = null;
      if (!pending) return;
      setAngleX(pending.angleX);
      setAngleZ(pending.angleZ);
      setZoom(pending.zoom);
    });
  };

  useEffect(() => () => {
    if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
  }, []);

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const handleNativeWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const factor = Math.exp(-event.deltaY * 0.0016);
      scheduleViewUpdate({ angleX, angleZ, zoom: zoom * factor });
    };
    element.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => element.removeEventListener('wheel', handleNativeWheel);
  }, [angleX, angleZ, zoom]);

  if (!all.length) return <div className="empty-state compact-empty"><h3>No 3D graph data</h3><p>CV1, CV2, and CV3 scores are required.</p></div>;
  const radX = angleX * Math.PI / 180;
  const radZ = angleZ * Math.PI / 180;
  const projectRaw = (x: number, y: number, z: number) => {
    const xz = x * Math.cos(radZ) - y * Math.sin(radZ);
    const yz = x * Math.sin(radZ) + y * Math.cos(radZ);
    const yy = yz * Math.cos(radX) - z * Math.sin(radX);
    const zz = yz * Math.sin(radX) + z * Math.cos(radX);
    return { x: xz, y: yy, z: zz };
  };
  const projected = all.map((point) => ({ ...point, ...projectRaw(point.x, point.y, point.z) })).sort((a, b) => a.z - b.z);
  const xs = projected.map((point) => point.x);
  const ys = projected.map((point) => point.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const scaleX = (x: number) => 330 + ((x - (minX + maxX) / 2) / Math.max(maxX - minX, 0.001)) * 430 * zoom;
  const scaleY = (y: number) => 205 - ((y - (minY + maxY) / 2) / Math.max(maxY - minY, 0.001)) * 270 * zoom;
  const axisLength = 150 * Math.max(0.62, Math.min(1.25, zoom));
  const axis = [{ label: 'CV 1', x: 1, y: 0, z: 0 }, { label: 'CV 2', x: 0, y: 1, z: 0 }, { label: 'CV 3', x: 0, y: 0, z: 1 }].map((a) => ({ ...a, ...projectRaw(a.x, a.y, a.z) }));

  const startRotate = (event: any) => {
    if (event.button !== 0 && event.button !== 2) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    dragState.current = { x: event.clientX, y: event.clientY, angleX, angleZ, zoom, mode: event.button === 2 ? 'zoom' : 'rotate', pointerId: event.pointerId };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const moveRotate = (event: any) => {
    const start = dragState.current;
    if (!start) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (start.mode === 'zoom') {
      scheduleViewUpdate({ angleX: start.angleX, angleZ: start.angleZ, zoom: start.zoom * Math.exp(-dy * 0.0075) });
      return;
    }
    scheduleViewUpdate({ angleZ: start.angleZ + dx * 0.17, angleX: start.angleX + dy * 0.12, zoom: start.zoom });
  };
  const endRotate = (event: any) => {
    if (dragState.current?.pointerId !== undefined) event.currentTarget.releasePointerCapture?.(dragState.current.pointerId);
    dragState.current = null;
  };
  return (
    <div ref={wrapRef} className="fd4-3d-plot-wrap">
      <div className="inline-graph-controls compact-3d-controls">
        <span>Drag or use the view controls to rotate and zoom.</span>
        <div className="canonical-3d-button-controls" role="group" aria-label="3D plot view controls">
          <button type="button" className="secondary tiny-button" aria-controls="canonical-3d-plot-svg" onClick={() => scheduleViewUpdate({ angleX, angleZ: angleZ - 12, zoom })}>Rotate left</button>
          <button type="button" className="secondary tiny-button" aria-controls="canonical-3d-plot-svg" onClick={() => scheduleViewUpdate({ angleX, angleZ: angleZ + 12, zoom })}>Rotate right</button>
          <button type="button" className="secondary tiny-button" aria-controls="canonical-3d-plot-svg" onClick={() => scheduleViewUpdate({ angleX: angleX - 8, angleZ, zoom })}>Rotate up</button>
          <button type="button" className="secondary tiny-button" aria-controls="canonical-3d-plot-svg" onClick={() => scheduleViewUpdate({ angleX: angleX + 8, angleZ, zoom })}>Rotate down</button>
          <button type="button" className="secondary tiny-button" aria-controls="canonical-3d-plot-svg" onClick={() => scheduleViewUpdate({ angleX, angleZ, zoom: zoom * 1.12 })}>Zoom in</button>
          <button type="button" className="secondary tiny-button" aria-controls="canonical-3d-plot-svg" onClick={() => scheduleViewUpdate({ angleX, angleZ, zoom: zoom / 1.12 })}>Zoom out</button>
          <button type="button" className="secondary tiny-button" aria-controls="canonical-3d-plot-svg" onClick={() => { setAngleX(DEFAULT_3D_VIEW.angleX); setAngleZ(DEFAULT_3D_VIEW.angleZ); setZoom(DEFAULT_3D_VIEW.zoom); }}>Reset view</button>
        </div>
        <span className="zoom-readout" role="status" aria-live="polite">Zoom {Math.round(zoom * 100)}%; horizontal angle {Math.round(angleZ)} degrees; vertical angle {Math.round(angleX)} degrees</span>
      </div>
      <svg
        ref={svgRef}
        id="canonical-3d-plot-svg"
        className="fd4-3d-canonical-plot mouse-rotatable-3d"
        viewBox="0 0 700 430"
        role="img"
        aria-label="3D canonical scatterplot"
        onPointerDown={startRotate}
        onPointerMove={moveRotate}
        onPointerUp={endRotate}
        onPointerLeave={endRotate}
        onPointerCancel={endRotate}
        onContextMenu={(event) => event.preventDefault()}
      >
        <rect width="700" height="430" fill="#ffffff"/>
        {axis.map((a) => <g key={a.label}><line x1="350" y1="215" x2={350 + a.x * axisLength} y2={215 - a.y * axisLength} stroke="#111" strokeWidth="1"/><text x={350 + a.x * (axisLength + 14)} y={215 - a.y * (axisLength + 14)} className="axis-label" fill="#000080">{a.label}</text></g>)}
        {projected.map((point) => {
          const color = point.kind === 'case' ? '#111827' : graphColorFor(point.group, module, colorMap);
          if (point.kind === 'centroid') {
            const centroidX = scaleX(point.x);
            const labelOnLeft = centroidX > 350;
            return <g key={`cent3d-${point.group}`} transform={`translate(${centroidX}, ${scaleY(point.y)})`}><rect x="-5" y="-5" width="10" height="10" fill={color} stroke="#111"/><text x={labelOnLeft ? -10 : 10} y="4" textAnchor={labelOnLeft ? 'end' : 'start'} className="centroid-label">{point.group}</text></g>;
          }
          if (point.kind === 'case') return <path key="case3d" d={`M ${scaleX(point.x)} ${scaleY(point.y)-9} L ${scaleX(point.x)+9} ${scaleY(point.y)} L ${scaleX(point.x)} ${scaleY(point.y)+9} L ${scaleX(point.x)-9} ${scaleY(point.y)} Z`} fill={color} stroke="#facc15" strokeWidth="2"/>;
          return <circle key={`p3d-${point.id}-${point.group}`} cx={scaleX(point.x)} cy={scaleY(point.y)} r="2.7" fill={color} fillOpacity="0.9"/>;
        })}
      </svg>
    </div>
  );
}

function calculateCranialValues(caseValues: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  const val = (key: string): number | null => {
    const raw = caseValues[key];
    if (raw === undefined || String(raw).trim() === '') return null;
    const numeric = Number(raw);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  };
  const deg = (radians: number) => radians * 180 / Math.PI;
  const acosDeg = (x: number): number | null => {
    if (!Number.isFinite(x) || x < -1 || x > 1) return null;
    return Math.round(deg(Math.acos(x)));
  };
  const atanDeg = (x: number): number | null => {
    if (!Number.isFinite(x)) return null;
    return deg(Math.atan(x));
  };
  const add = (key: string, value: number | null) => {
    if (value !== null && Number.isFinite(value)) result[key] = String(Math.round(value));
  };

  const BNL = val('BNL');
  const BPL = val('BPL');
  const NPH = val('NPH');
  const UFHT = val('UFHT');
  const faceHeight = NPH ?? UFHT;
  if (BNL && BPL && faceHeight) {
    add('NAA', acosDeg((faceHeight ** 2 + BNL ** 2 - BPL ** 2) / (2 * BNL * faceHeight)));
    add('PRA', acosDeg((faceHeight ** 2 + BPL ** 2 - BNL ** 2) / (2 * BPL * faceHeight)));
    add('BAA', acosDeg((BPL ** 2 + BNL ** 2 - faceHeight ** 2) / (2 * BPL * BNL)));
  }

  const BBH = val('BBH');
  const FRC = val('FRC');
  if (BBH && BNL && FRC) {
    add('NBA', acosDeg((FRC ** 2 + BNL ** 2 - BBH ** 2) / (2 * BNL * FRC)));
    add('BRA', acosDeg((FRC ** 2 + (BBH ** 2 - BNL ** 2)) / (2 * FRC * BBH)));
    add('BBA', acosDeg((BBH ** 2 + BNL ** 2 - FRC ** 2) / (2 * BNL * BBH)));
  }

  const twoAtanAngle = (heightKey: string, baseKey: string): number | null => {
    const h = val(heightKey);
    const b = val(baseKey);
    if (!h || !b) return null;
    const a = atanDeg(h / (b / 2));
    return a === null ? null : 180 - (a * 2);
  };
  add('SSA', twoAtanAngle('SSS', 'ZMB'));
  add('NFA', twoAtanAngle('NAS', 'FMB'));
  add('NDA', twoAtanAngle('NDS', 'DKB'));
  add('SIA', twoAtanAngle('SIS', 'WNB'));
  add('TBA', twoAtanAngle('BAR', 'AUB'));

  const DKS = val('DKS');
  const OBB = val('OBB');
  if (DKS && OBB) {
    const angle = acosDeg(DKS / OBB);
    add('DKA', angle === null ? null : angle * 2);
  }

  const twoArctanSum = (chordKey: string, fractionKey: string, subtenseKey: string): number | null => {
    const chord = val(chordKey);
    const fraction = val(fractionKey);
    const subtense = val(subtenseKey);
    if (!chord || !fraction || !subtense) return null;
    const a = atanDeg(fraction / subtense);
    const b = atanDeg((chord - fraction) / subtense);
    return a === null || b === null ? null : a + b;
  };
  add('FRA', twoArctanSum('FRC', 'FRF', 'FRS'));
  add('PAA', twoArctanSum('PAC', 'PAF', 'PAS'));
  add('OCA', twoArctanSum('OCC', 'OCF', 'OCS'));

  const angleFromSides = (aKey: string, bKey: string, oppositeKey: string): number | null => {
    const a = val(aKey);
    const b = val(bKey);
    const c = val(oppositeKey);
    if (!a || !b || !c) return null;
    return acosDeg((a ** 2 + b ** 2 - c ** 2) / (2 * a * b));
  };
  add('RFA', angleFromSides('BRR', 'NAR', 'FRC'));
  add('RPA', angleFromSides('BRR', 'LAR', 'PAC'));
  add('ROA', angleFromSides('LAR', 'OSR', 'OCC'));

  const BSA1 = angleFromSides('BPL', 'BAR', 'PRR');
  const BSA2 = angleFromSides('FOL', 'BAR', 'OSR');
  add('BSA', BSA1 === null || BSA2 === null ? null : 360 - (BSA1 + BSA2));

  const SBA1 = angleFromSides('BRR', 'FRC', 'NAR');
  const SBA2 = angleFromSides('BRR', 'PAC', 'LAR');
  add('SBA', SBA1 === null || SBA2 === null ? null : SBA1 + SBA2);

  const SLA1 = angleFromSides('LAR', 'PAC', 'BRR');
  const SLA2 = angleFromSides('LAR', 'OCC', 'OSR');
  add('SLA', SLA1 === null || SLA2 === null ? null : SLA1 + SLA2);

  return result;
}

function modelEigenRows(model: Record<string, any>): Array<Record<string, any>> {
  const eigenvalues = Array.isArray(model.eigenvalues) ? model.eigenvalues : [];
  const proportions = Array.isArray(model.eigenvalue_proportions) ? model.eigenvalue_proportions : [];
  let cumulative = 0;
  return eigenvalues.map((value: any, index: number) => {
    const percent = Number(proportions[index] ?? 0) * 100;
    cumulative += Number.isFinite(percent) ? percent : 0;
    return {
      canonical_variate: index + 1,
      eigenvalue: value,
      percent_of_total_variation: percent,
      cumulative_percent: cumulative
    };
  });
}

function neighborSummaryRows(neighbors: Array<Record<string, any>>): Array<Record<string, any>> {
  const counts: Record<string, { population: string; count: number; nearest_distance: number | null }> = {};
  for (const row of neighbors) {
    const population = String(row.Pop ?? row.population ?? row.group ?? row.PopSex ?? 'Unknown');
    const distance = Number(row.Distance ?? row.distance ?? row.d_squared);
    if (!counts[population]) counts[population] = { population, count: 0, nearest_distance: Number.isFinite(distance) ? distance : null };
    counts[population].count += 1;
    if (Number.isFinite(distance)) {
      counts[population].nearest_distance = counts[population].nearest_distance === null ? distance : Math.min(counts[population].nearest_distance ?? distance, distance);
    }
  }
  return Object.values(counts).sort((a, b) => b.count - a.count || String(a.population).localeCompare(String(b.population)));
}

function cleanOutlierRows(rows: Array<Record<string, any>>): Array<Record<string, any>> {
  return rows.map((row) => {
    const { f_typicality_display, ...rest } = row;
    return rest;
  });
}

function parseNumberOrDefault(value: string, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function parseIntegerOrDefault(value: string, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(1, Math.round(numeric)) : fallback;
}

function extractOutlierIds(rows: Array<Record<string, any>>) {
  const ids = rows
    .map((row) => row.id ?? row.ID ?? row.RecID ?? row.CATKEY ?? row.catkey ?? row.FDN ?? row.item)
    .filter((value) => value !== undefined && value !== null && String(value).trim() !== '')
    .map((value) => String(value).trim());
  return Array.from(new Set(ids));
}

function mergeExcludeIds(existingText: string, ids: string[]) {
  const existing = parseExcludeIds(existingText);
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const id of [...existing, ...ids]) {
    const normalized = String(id).trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    merged.push(normalized);
  }
  const addedCount = ids.filter((id) => !new Set(existing).has(String(id).trim())).length;
  return { text: merged.join('\n'), addedCount, totalCount: merged.length };
}

function parseExcludeIds(value: string) {
  return value
    .split(/[\n,\t; ]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function nonblankCaseValues(caseValues: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(caseValues)
      .filter(([, value]) => String(value ?? '').trim() !== '')
      .sort(([a], [b]) => a.localeCompare(b))
  );
}

function buildDfaAnalysisSignature(caseValues: Record<string, string>, includedVariables: Set<string>, selectedGroups: Set<string>, selectedModule: ModuleId, checkMeasurementErrors: boolean, outlierDetectionThreshold: string, nearestNeighborCount: string, excludeIdsText: string, useCustomReferenceAnalysis: boolean, importGroupMode: string | null, transformationMode: TransformationMode, stepwiseMode: StepwiseMode, stepwiseMinVariables: string, stepwiseMaxVariables: string, stepwiseThreshold: string, stepwiseTurbo: boolean, stepwiseWeighting: StepwiseWeighting, classifyOnlyIfTypF: boolean, classifyOnlyIfTypFThreshold: string, classifyCase: boolean, classificationRateMode: ClassificationRateMode) {
  return JSON.stringify({
    analysis: 'dfa',
    module: selectedModule,
    variables: Array.from(includedVariables).sort(),
    groups: Array.from(selectedGroups).sort(),
    checkMeasurementErrors,
    outlierDetectionThreshold,
    nearestNeighborCount,
    excludeIds: parseExcludeIds(excludeIdsText),
    useCustomReferenceAnalysis,
    importGroupMode,
    transformationMode,
    stepwiseMode,
    stepwiseMinVariables,
    stepwiseMaxVariables,
    stepwiseThreshold,
    stepwiseTurbo,
    stepwiseWeighting,
    classifyOnlyIfTypF,
    classifyOnlyIfTypFThreshold,
    classifyCase,
    classificationRateMode,
    case: classifyCase ? nonblankCaseValues(caseValues) : {}
  });
}

function buildStatureAnalysisSignature(caseValues: Record<string, string>, includedVariables: Set<string>, checkMeasurementErrors: boolean, statureLevel: string, statureMaxTerms: string, statureDisplayRows: string, statureBirthyearMin: string, statureBirthyearMax: string, statureIncludeBirthyearMissing: boolean, statureReference: StatureReference, statureGroupMode: StatureGroupMode, statureManualGroup: string, statureSortBy: StatureSortBy, resolvedGroup: string | null) {
  return JSON.stringify({
    analysis: 'stature',
    module: 'postcranial_stature',
    variables: Array.from(includedVariables).sort(),
    checkMeasurementErrors,
    statureLevel,
    statureMaxTerms,
    statureDisplayRows,
    statureBirthyearMin,
    statureBirthyearMax,
    statureIncludeBirthyearMissing,
    statureReference,
    statureGroupMode,
    statureManualGroup,
    resolvedGroup,
    statureSortBy,
    case: nonblankCaseValues(caseValues)
  });
}

function resolveStandaloneStatureSelection(mode: StatureGroupMode, manualGroup: string, lastClassifiedGroup: string | null, classificationIsCurrent: boolean): StandaloneStatureSelection {
  if (mode === 'any') {
    return { ready: true, group: 'Any', label: 'Any', note: 'Stature group: Any. No postcranial DFA is required.' };
  }
  if (mode === 'manual') {
    const group = STATURE_GROUP_OPTIONS.includes(manualGroup) ? manualGroup : 'Any';
    return { ready: true, group, label: group, note: `Stature group: ${group}, selected independently of Postcranial DFA.` };
  }
  if (!classificationIsCurrent || !lastClassifiedGroup) {
    return { ready: false, group: null, label: 'Top classified group', note: 'Run Postcranial DFA with the current measurements and groups, or choose Any or a manual stature group.' };
  }
  if (STATURE_GROUP_OPTIONS.includes(lastClassifiedGroup) && lastClassifiedGroup !== 'Any') {
    return { ready: true, group: lastClassifiedGroup, label: lastClassifiedGroup, note: `Stature group: ${lastClassifiedGroup}, from the current Postcranial DFA.` };
  }
  return { ready: true, group: 'Any', label: 'Any', note: `The current Postcranial DFA group ${lastClassifiedGroup} has no group-specific FD3 stature option; Any will be used.` };
}

function postcranialClassifiedGroup(response: AnalyzeResponse) {
  const result = response.result ?? {};
  const predicted = result.classification?.predicted_group;
  if (predicted !== undefined && predicted !== null && String(predicted).trim() !== '') return String(predicted).trim();
  const relationship = Array.isArray(result.relationship) ? result.relationship : [];
  const top = relationship[0]?.group;
  return top !== undefined && top !== null && String(top).trim() !== '' ? String(top).trim() : null;
}

function formatNumber(value: any) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return numeric.toFixed(3);
}

function formatProbability(value: any) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return numeric.toFixed(3);
}

function parseProbabilityValue(value: any) {
  const text = String(value ?? '').replace(/%/g, '').trim();
  const match = text.match(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
  const numeric = match ? Number(match[0]) : Number(text);
  return Number.isFinite(numeric) ? numeric : null;
}

function typicalityEmphasisClass(value: any) {
  const numeric = parseProbabilityValue(value);
  if (numeric === null) return '';
  if (numeric < 0.01) return 'typicality-critical';
  if (numeric < 0.05) return 'typicality-caution';
  return '';
}

function TypicalityValue({ value }: { value: any }) {
  const className = typicalityEmphasisClass(value);
  return <span className={`typicality-value${className ? ` ${className}` : ''}`}>{formatProbability(value)}</span>;
}

function formatSignedSd(value: any) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  const magnitude = Math.abs(numeric);
  if (magnitude === 0) return '';
  // FD3 convention: one sign for a simple high/low value, two at 1–2 SD,
  // three at 2–3 SD, and four at 3+ SD.
  const count = magnitude >= 3 ? 4 : magnitude >= 2 ? 3 : magnitude >= 1 ? 2 : 1;
  const sign = numeric > 0 ? '+' : '-';
  return sign.repeat(count);
}

function measurementDeviationClass(value: any) {
  const marker = typeof value === 'string' ? value.trim() : '';
  if (/^\+{3,4}$/.test(marker)) return 'measurement-deviation-high';
  if (/^-{3,4}$/.test(marker)) return 'measurement-deviation-low';
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || Math.abs(numeric) < 2) return '';
  return numeric > 0 ? 'measurement-deviation-high' : 'measurement-deviation-low';
}

function formatReferenceCounts(counts: Record<string, any> | undefined) {
  if (!counts) return '—';
  return Object.entries(counts).map(([group, count]) => `${group} ${count}`).join(' / ');
}

function formatValidationSummary(validation: Record<string, any> | undefined) {
  if (!validation) return '—';
  return `${validation.error_count ?? 0} errors / ${validation.warning_count ?? 0} warnings`;
}

function formatOutlierSummary(outliers: Record<string, any> | undefined) {
  if (!outliers) return '—';
  return `${outliers.detected_count ?? 0} detected / ${outliers.excluded_count ?? 0} excluded`;
}

function buildClientValidation(caseValues: Record<string, string>, includedVariables: Set<string>, variables: VariableMetadata[], checkMeasurementErrors: boolean, classifyCase: boolean): ClientValidation {
  const variableMap = new Map(variables.map((variable) => [variable.variable, variable]));
  const warnings: ClientValidationItem[] = [];
  const errors: ClientValidationItem[] = [];
  const byVariable: Record<string, ClientValidationItem[]> = {};

  if (!classifyCase) return { warnings, errors, byVariable };

  function add(item: ClientValidationItem) {
    if (!byVariable[item.variable]) byVariable[item.variable] = [];
    byVariable[item.variable].push(item);
    if (item.severity === 'error') errors.push(item);
    else warnings.push(item);
  }

  for (const variable of includedVariables) {
    const value = caseValues[variable]?.trim() ?? '';
    const meta = variableMap.get(variable);
    if (value === '') {
      add({ variable, severity: 'error', message: 'Selected for analysis but no value entered.' });
      continue;
    }
    const numeric = Number(value);
    if (Number.isNaN(numeric)) {
      add({ variable, severity: 'error', message: 'Value must be numeric.' });
      continue;
    }
    if (meta?.range && typeof meta.range.lower === 'number' && typeof meta.range.upper === 'number' && (numeric < meta.range.lower || numeric > meta.range.upper)) {
      const width = meta.range.upper - meta.range.lower;
      const farOutside = width > 0 && (numeric < meta.range.lower - (0.5 * width) || numeric > meta.range.upper + (0.5 * width));
      add({
        variable,
        severity: checkMeasurementErrors ? 'error' : 'warning',
        type: farOutside ? 'far_outside_expected_range' : 'outside_expected_range',
        message: checkMeasurementErrors
          ? (farOutside
            ? `Far outside accepted range (${meta.range.lower}–${meta.range.upper}). Correct before running, or turn off Check for measurement error in Options.`
            : `Outside accepted range (${meta.range.lower}–${meta.range.upper}). Correct before running, or turn off Check for measurement error in Options.`)
          : (farOutside
            ? `Far outside accepted range (${meta.range.lower}–${meta.range.upper}). Check for measurement error is off.`
            : `Outside accepted range (${meta.range.lower}–${meta.range.upper}). Check for measurement error is off.`)
      });
    }
  }

  return { warnings, errors, byVariable };
}

function extendedResultsAvailabilityRows(extended: Record<string, any>, relationship: any) {
  const rows: Array<{ section: string; status: string }> = [];
  const add = (section: string, value: any, label = 'rows') => {
    if (Array.isArray(value)) rows.push({ section, status: `${value.length} ${label}` });
    else if (value && typeof value === 'object') rows.push({ section, status: 'available' });
    else if (value !== undefined && value !== null) rows.push({ section, status: 'available' });
  };
  add('Relationship table', relationship);
  add('Group means', extended.group_means);
  add('Standard deviations', extended.group_sds);
  add('Pooled VCVM', extended.pooled_vcvm);
  add('Pooled VCVM summary', extended.pooled_vcvm_summary);
  add('VCVM homogeneity', extended.vcvm_homogeneity);
  add('Within-group VCVM summaries', extended.within_group_vcvm_summaries);
  add('Within-group VCVMs', extended.within_group_vcvms);
  add('Jackknifed VCVM summaries', extended.jackknifed_vcvm_summaries);
  add('Jackknifed VCVMs', extended.jackknifed_vcvms);
  add('Total sample VCVM', extended.total_vcvm);
  add('Pooled correlation', extended.pooled_cor);
  add('Group canonical scores', extended.group_mean_canonical_scores);
  add('Case canonical score', extended.case_canonical_score);
  add('Reference canonical scores', extended.reference_canonical_scores);
  add('Reference posterior probabilities', extended.reference_posterior_probabilities);
  add('Case posterior probabilities', extended.case_posterior_probabilities);
  add('Canonical structure', extended.canonical_structure_coefficients);
  add('Model discriminant summary', extended.model?.wilks_lambda !== undefined ? { wilks_lambda: extended.model.wilks_lambda } : null);
  add('Classification matrix', extended.classification?.table);
  add('FD3 classification matrix', extended.classification?.fd3_table);
  add('Stepwise selection', extended.stepwise?.active ? extended.stepwise : null);
  add('Classification statistics', extended.additional_classification_statistics?.rows);
  add('Pairwise D²', extended.pairwise_mahalanobis);
  add('Pairwise D² significance', extended.pairwise_mahalanobis_significance);
  add('Reference classifications', extended.reference_classifications);
  add('Nearest neighbors', extended.nearest_neighbors);
  add('Reference outliers', extended.outliers?.detected);
  add('All stature equations', extended.all_results);
  return rows;
}

function buildExtendedResultFiles(result: AnalyzeResponse | null, baseName: string) {
  if (!result?.result?.extended_results) return [];
  const extended = result.result.extended_results;
  const files: Array<{ name: string; content: string }> = [];
  const addCsv = (name: string, rows: any) => {
    if (!Array.isArray(rows) || rows.length === 0) return;
    files.push({ name: `${baseName}_${name}.csv`, content: rowsToCsv(rows) });
  };
  const relationshipRows = result.result.relationship;
  if (result.result.classification_safeguard) addCsv('classification_safeguard', [result.result.classification_safeguard]);
  const customSummaryRows = customReferenceSummaryRows(result);
  addCsv('custom_reference_summary', customSummaryRows);
  addCsv('relationship_table', relationshipRows);
  addCsv('classification_matrix', extended.classification?.table);
  addCsv('classification_matrix_fd3_format', extended.classification ? classificationMatrixRowsForDisplay(extended.classification, 'counts') : []);
  if (extended.classification?.fd3_total_correct) addCsv('classification_matrix_total_correct', [{ total_correct: extended.classification.fd3_total_correct }]);
  if (extended.stepwise?.active) addCsv('stepwise_summary', [{
    method: extended.stepwise.method,
    label: extended.stepwise.label,
    selection_metric: extended.stepwise.selection_metric,
    selected_variable_count: extended.stepwise.selected_variable_count,
    original_variable_count: extended.stepwise.original_variable_count,
    threshold: extended.stepwise.threshold,
    weighting: extended.stepwise.weighting ?? 'unweighted',
    best_score: extended.stepwise.best_score,
    selected_variables: Array.isArray(extended.stepwise.selected_variables) ? extended.stepwise.selected_variables.join(' ') : ''
  }]);
  addCsv('stepwise_steps', extended.stepwise?.step_log);
  addCsv('group_means', extended.group_means);
  addCsv('group_standard_deviations', extended.group_sds);
  addCsv('pooled_vcvm', extended.pooled_vcvm);
  if (extended.pooled_vcvm_summary) addCsv('pooled_vcvm_summary', Array.isArray(extended.pooled_vcvm_summary) ? extended.pooled_vcvm_summary : [extended.pooled_vcvm_summary]);
  if (extended.vcvm_homogeneity) addCsv('vcvm_homogeneity_kullback', Array.isArray(extended.vcvm_homogeneity) ? extended.vcvm_homogeneity : [extended.vcvm_homogeneity]);
  addCsv('within_group_vcvm_summaries', extended.within_group_vcvm_summaries);
  addCsv('within_group_vcvms', extended.within_group_vcvms);
  addCsv('jackknifed_vcvm_summaries', extended.jackknifed_vcvm_summaries);
  addCsv('jackknifed_vcvms', extended.jackknifed_vcvms);
  addCsv('total_sample_vcvm', extended.total_vcvm);
  if (extended.total_vcvm_summary) addCsv('total_sample_vcvm_summary', Array.isArray(extended.total_vcvm_summary) ? extended.total_vcvm_summary : [extended.total_vcvm_summary]);
  addCsv('pooled_correlation', extended.pooled_cor);
  addCsv('group_canonical_scores', extended.group_mean_canonical_scores);
  if (extended.case_canonical_score) addCsv('case_canonical_score', Array.isArray(extended.case_canonical_score) ? extended.case_canonical_score : [extended.case_canonical_score]);
  addCsv('reference_canonical_scores', extended.reference_canonical_scores);
  addCsv('reference_posterior_probabilities', extended.reference_posterior_probabilities);
  if (extended.case_posterior_probabilities) addCsv('case_posterior_probabilities', Array.isArray(extended.case_posterior_probabilities) ? extended.case_posterior_probabilities : [extended.case_posterior_probabilities]);
  addCsv('canonical_structure_coefficients', extended.canonical_structure_coefficients);
  addCsv('eigenvalues', extended.model?.eigenvalues ? modelEigenRows(extended.model) : []);
  if (extended.model?.wilks_lambda !== undefined) addCsv('model_discriminant_summary', [{ wilks_lambda: extended.model.wilks_lambda }]);
  if (extended.ln_correlation_matrix_determinant !== undefined) addCsv('ln_correlation_matrix_determinant', [{ value: extended.ln_correlation_matrix_determinant }]);
  addCsv('classification_statistics', extended.additional_classification_statistics?.rows);
  if (extended.additional_classification_statistics?.summary) addCsv('classification_statistics_summary', [extended.additional_classification_statistics.summary]);
  addCsv('pairwise_mahalanobis', extended.pairwise_mahalanobis);
  addCsv('pairwise_mahalanobis_significance', extended.pairwise_mahalanobis_significance);
  addCsv('reference_classifications', extended.reference_classifications);
  addCsv('nearest_neighbors', extended.nearest_neighbors);
  if (Array.isArray(extended.nearest_neighbors) && extended.nearest_neighbors.length) addCsv('nearest_neighbors_by_population', neighborSummaryRows(extended.nearest_neighbors));
  addCsv('reference_outliers', extended.outliers?.detected);
  addCsv('all_stature_equations', extended.all_results);
  files.unshift({
    name: `${baseName}_extended_results_manifest.txt`,
    content: [
      'FORDISC 4.0 Extended Results CSV Package',
      'Application: FORDISC 4.0',
      `Operation: ${result.operation}`,
      `Files included: ${files.length}`,
      '',
      ...files.map((file) => `- ${file.name}`)
    ].join('\n')
  });
  return files;
}


type ReportOptions = {
  interfaceLanguage: InterfaceLanguage;
  sortGroupsMode: SortGroupsMode;
  classificationMatrixMode: ClassificationMatrixMode;
  typicalityDisplay: TypicalityDisplaySettings;
  statureUnits: StatureUnits;
  transformationMode: TransformationMode;
  checkMeasurementErrors: boolean;
  outlierDetectionThreshold: string;
  nearestNeighborCount: string;
  excludeIdsText: string;
  analystName: string;
  stepwiseMode: StepwiseMode;
  stepwiseMinVariables: string;
  stepwiseMaxVariables: string;
  stepwiseThreshold: string;
  stepwiseTurbo: boolean;
  stepwiseWeighting: StepwiseWeighting;
  classifyOnlyIfTypF: boolean;
  classifyOnlyIfTypFThreshold: string;
  classifyCase: boolean;
  classificationRateMode: ClassificationRateMode;
};

function typicalityDisplayLabel(settings: TypicalityDisplaySettings) {
  const labels: string[] = [];
  if (settings.f) labels.push('Typ. F');
  if (settings.chi) labels.push('Typ. χ²');
  if (settings.ranked) labels.push('Typ. R');
  return labels.length ? labels.join(', ') : 'None';
}

function stepwiseModeLabel(mode: StepwiseMode) {
  if (mode === 'forward_wilks') return "Forward Wilks selected";
  if (mode === 'forward_mean') return 'Forward Mean % selected';
  if (mode === 'forward_min') return 'Forward Minimum % selected';
  if (mode === 'forward_kappa') return "Forward Cohen's Kappa selected";
  return 'None';
}

function classificationRateLabel(mode: string | undefined) {
  return mode === 'resubstitution' ? 'Resubstitution (N, N)' : 'LOO (Jackknife; 1, N-1)';
}

function operationDisplayName(operation: string | undefined) {
  if (operation === 'international_crania_dfa') return 'International Crania DFA';
  if (operation === 'postcranial_stature') return 'Postcranial';
  if (operation === 'custom_reference_dfa') return 'Custom reference DFA';
  if (operation === 'stature') return 'Stature estimation';
  if (operation === 'postcranial_dfa') return 'Postcranial DFA';
  if (operation === 'cranial_dfa') return 'Cranial DFA';
  return operation ? titleCase(operation) : 'FORDISC 4.0 analysis';
}

function reportGraphModule(result: AnalyzeResponse): ModuleId {
  if (result.operation === 'international_crania_dfa') return 'cranial_international_dfa';
  if (result.operation === 'postcranial_stature' || result.operation === 'postcranial_dfa') return 'postcranial_stature';
  return 'cranial_fdb_dfa';
}

function reportSummaryRows(result: AnalyzeResponse, caseId: string, options: ReportOptions) {
  return [
    { item: 'Case ID', value: caseId.trim() || '—' },
    { item: 'Analyst', value: options.analystName.trim() || '—' },
    { item: 'Analysis', value: operationDisplayName(result.operation) },
    { item: 'Generated', value: new Date().toLocaleString() }
  ];
}

function analysisSettingsReportRows(result: AnalyzeResponse, options: ReportOptions) {
  const r = result.result ?? {};
  if (result.operation === 'stature') {
    const statureOptions = r.stature_options ?? {};
    const level = Number(statureOptions.prediction_interval_level);
    const rows: Array<Record<string, any>> = [
      { item: 'Measurement checking', value: options.checkMeasurementErrors ? 'On' : 'Off' },
      { item: 'Stature reference sample', value: statureOptions.stature_reference_label ?? '20th C FStats' },
      { item: 'Stature group', value: Array.isArray(statureOptions.resolved_groups) ? statureOptions.resolved_groups.join(', ') : 'Any' },
      { item: 'Prediction interval', value: Number.isFinite(level) ? `${Math.round(level * 100)}%` : '—' },
      { item: 'Maximum measurements per equation', value: statureOptions.max_terms ?? '—' },
      { item: 'Sort estimates by', value: statureOptions.sort_by === 'r_square' ? 'R-square' : 'Prediction interval' },
      { item: 'Minimum birth year', value: statureOptions.birthyear_min ?? '—' },
      { item: 'Maximum birth year', value: statureOptions.birthyear_max ?? 'No maximum' },
      { item: 'Include records with missing birth year', value: statureOptions.include_birthyear_missing === false ? 'No' : 'Yes' },
      { item: 'Stature display units', value: statureUnitLongLabel(options.statureUnits) }
    ];
    if (Array.isArray(r.variables_used)) rows.push({ item: 'Variables used', value: r.variables_used.join(', ') });
    return rows;
  }
  const rows: Array<Record<string, any>> = [
    { item: 'Measurement checking', value: options.checkMeasurementErrors ? 'On' : 'Off' },
    { item: 'Outlier threshold', value: options.outlierDetectionThreshold || '—' },
    { item: 'Nearest neighbors', value: options.nearestNeighborCount || '—' },
    { item: 'Sort groups', value: options.sortGroupsMode === 'group_name' ? 'Group name' : 'Distance' },
    { item: 'Classification matrix display', value: options.classificationMatrixMode === 'percentages' ? 'Percentages' : 'Counts' },
    { item: 'Typicality probabilities displayed', value: typicalityDisplayLabel(options.typicalityDisplay) },
    { item: 'Classify Case', value: (r.classification?.case_classified ?? r.classify_case ?? options.classifyCase) ? 'On' : 'Off' },
    { item: 'Classification rate estimation', value: r.classification?.rate_estimation?.label ?? classificationRateLabel(r.classification_rate_estimation ?? options.classificationRateMode) },
    { item: 'Classify only if Typ. F >', value: `${(r.classification_safeguard?.enabled ?? options.classifyOnlyIfTypF) ? 'On' : 'Off'}${(r.classification_safeguard?.enabled ?? options.classifyOnlyIfTypF) ? ` (${r.classification_safeguard?.threshold ?? options.classifyOnlyIfTypFThreshold})` : ''}` },
    { item: 'Stepwise variable selection', value: r.stepwise?.label ?? stepwiseModeLabel(options.stepwiseMode) }
  ];
  if (r.stepwise?.active) {
    rows.push({ item: 'Stepwise selected variables', value: Array.isArray(r.stepwise.selected_variables) ? r.stepwise.selected_variables.join(', ') : '—' });
    rows.push({ item: 'Stepwise settings', value: `min ${r.stepwise.min_variables ?? '—'}, max ${r.stepwise.max_variables ?? '—'}, step ${r.stepwise.threshold ?? '—'}, turbo ${r.stepwise.turbo ? 'On' : 'Off'}, weighting ${r.stepwise.weighting ?? 'unweighted'}` });
  }
  if (!r.stepwise?.active && options.stepwiseMode !== 'none') {
    rows.push({ item: 'Stepwise settings', value: `min ${options.stepwiseMinVariables || '—'}, max ${options.stepwiseMaxVariables || '—'}, step ${options.stepwiseThreshold || '—'}, turbo ${options.stepwiseTurbo ? 'On' : 'Off'}, weighting ${options.stepwiseWeighting}` });
  }
  rows.push({ item: 'Transformation', value: r.transformation && r.transformation !== 'none' ? String(r.transformation).toUpperCase() : 'None' });
  if (r.best_estimate || result.operation === 'stature' || result.operation === 'postcranial_stature') rows.push({ item: 'Stature display units', value: statureUnitLongLabel(options.statureUnits) });
  if (Array.isArray(r.measurements_removed) && r.measurements_removed.length) rows.push({ item: 'Measurements removed', value: r.measurements_removed.join(', ') });
  if (Array.isArray(r.variables_used)) rows.push({ item: 'Variables used', value: r.variables_used.join(', ') });
  const groups = r.group_selection?.resolved_groups ?? r.groups;
  if (Array.isArray(groups)) rows.push({ item: 'Reference groups', value: groups.join(', ') });
  if (r.custom_reference) {
    rows.push({ item: 'Reference source', value: 'Custom reference data' });
    if (r.custom_reference.reference_label) rows.push({ item: 'Custom reference file', value: r.custom_reference.reference_label });
    if (r.custom_reference.row_count !== undefined) rows.push({ item: 'Custom reference rows', value: r.custom_reference.row_count });
    if (r.custom_reference.group_column) rows.push({ item: 'Custom reference group field', value: r.custom_reference.group_column });
    if (r.custom_reference.id_column) rows.push({ item: 'Custom reference ID field', value: r.custom_reference.id_column });
  }
  if (r.outliers?.excluded_ids?.length) rows.push({ item: 'Excluded IDs', value: r.outliers.excluded_ids.join(', ') });
  else if (parseExcludeIds(options.excludeIdsText).length) rows.push({ item: 'Excluded IDs', value: parseExcludeIds(options.excludeIdsText).join(', ') });
  return rows;
}

function classificationSummaryRows(result: AnalyzeResponse, options: ReportOptions) {
  const r = result.result ?? {};
  const classification = r.classification;
  const topRelationship = Array.isArray(r.relationship) ? r.relationship[0] : null;
  const rows: Array<Record<string, any>> = [];
  if (!classification && !topRelationship) return rows;
  const caseClassified = classification?.case_classified !== false;
  if (!caseClassified) {
    rows.push({ item: 'Classification mode', value: 'Group classification only' });
  } else if (classification?.predicted_group !== undefined) {
    rows.push({ item: 'Predicted group', value: classification.predicted_group });
  }
  if (caseClassified && r.classification_safeguard?.triggered) rows.push({ item: 'Classification safeguard', value: r.classification_safeguard.message ?? 'Classification withheld by Typ. F safeguard.' });
  if (caseClassified && topRelationship?.posterior_probability !== undefined) rows.push({ item: 'Posterior probability', value: formatProbability(topRelationship.posterior_probability) });
  if (caseClassified && options.typicalityDisplay.chi && topRelationship?.typicality_chi_square !== undefined) rows.push({ item: 'Typ. χ²', value: formatProbability(topRelationship.typicality_chi_square) });
  if (caseClassified && options.typicalityDisplay.f && topRelationship?.typicality_f !== undefined) rows.push({ item: 'Typ. F', value: formatProbability(topRelationship.typicality_f) });
  if (caseClassified && options.typicalityDisplay.ranked && topRelationship?.typicality_ranked !== undefined) rows.push({ item: 'Typ. R', value: formatProbability(topRelationship.typicality_ranked) });
  if (caseClassified && options.typicalityDisplay.ranked && topRelationship?.typicality_rank && topRelationship?.typicality_rank_denominator) rows.push({ item: 'Rank', value: `${topRelationship.typicality_rank}/${topRelationship.typicality_rank_denominator}` });
  if (classification?.total_correct) {
    const label = classification.rate_estimation?.label ?? classificationRateLabel(r.classification_rate_estimation ?? options.classificationRateMode);
    rows.push({ item: `${label} accuracy`, value: `${classification.total_correct.percent?.toFixed?.(1) ?? '—'}% (${classification.total_correct.correct}/${classification.total_correct.total})` });
  }
  return rows;
}

function statureSummaryRows(result: AnalyzeResponse, units: StatureUnits) {
  const best = result.result?.best_estimate;
  if (!best) return [];
  const options = result.result?.stature_options ?? {};
  return [
    { item: 'Stature reference', value: options.stature_reference_label ?? '20th C FStats' },
    { item: 'Stature group', value: Array.isArray(options.resolved_groups) ? options.resolved_groups.join(', ') : 'Any' },
    { item: 'Sort by', value: options.sort_by === 'r_square' ? 'R²' : 'Prediction interval' },
    { item: 'Best stature estimate', value: `${formatStatureCell('Point_Est', best.Point_Est, units)} ${statureUnitAbbreviation(units)}` },
    { item: 'Prediction interval', value: `${formatStatureCell('L', best.L, units)}–${formatStatureCell('U', best.U, units)} ${statureUnitAbbreviation(units)}` },
    { item: 'Prediction interval width', value: `${formatStatureCell('PI', best.PI, units)} ${statureUnitAbbreviation(units)}` },
    { item: 'Equation', value: best.Measurement ?? '—' },
    { item: 'Equation value', value: formatStatureCell('Value', best.Value, units) },
    { item: 'Equations evaluated', value: result.result?.stature_result_count ?? result.result?.result_count ?? '—' }
  ];
}

function warningReportRows(result: AnalyzeResponse) {
  const r = result.result ?? {};
  const rows: Array<Record<string, any>> = [];
  const validation = r.input_validation ?? {};
  if (validation.measurement_check_skipped) rows.push({ type: 'Measurement check', message: 'Measurement range checking was skipped for this analysis.' });
  for (const error of validation.errors ?? []) rows.push({ type: 'Input error', message: error.message ?? JSON.stringify(error) });
  for (const warning of validation.warnings ?? []) rows.push({ type: 'Input warning', message: warning.message ?? JSON.stringify(warning) });
  if (r.case_representation_warning?.message) rows.push({ type: 'Reference fit', message: r.case_representation_warning.message });
  if (r.classification_safeguard?.triggered) rows.push({ type: 'Classification safeguard', message: r.classification_safeguard.message ?? 'Classification withheld by Typ. F safeguard.' });
  if (Array.isArray(r.measurements_removed) && r.measurements_removed.length) rows.push({ type: 'Measurements removed', message: `${r.measurements_removed.join(', ')} removed during DFA because the selected reference groups had insufficient complete sample sizes.` });
  const outlierWarning = r.outliers?.warning ?? r.extended_results?.outliers?.warning;
  if (outlierWarning) rows.push({ type: 'Reference-sample outliers', message: outlierWarning });
  return rows;
}

function measurementCheckReportRows(result: AnalyzeResponse) {
  const rows = result.result?.measurement_checks;
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    const marker = String(row.check_marker ?? row.check ?? formatSignedSd(row.standard_deviations_from_mean));
    const out: Record<string, any> = {
      variable: row.variable ?? '—',
      current_case: formatCell(row.current_case ?? row.value),
      check: marker,
      __deviation: marker || Number(row.standard_deviations_from_mean)
    };
    const groupMeans = row.group_means ?? {};
    for (const group of Object.keys(groupMeans)) out[group] = formatOneDecimalCell(groupMeans[group]);
    if (row.df_weight !== null && row.df_weight !== undefined) out.df_weights = formatCell(row.df_weight);
    if (row.relative_group_importance_percent !== null && row.relative_group_importance_percent !== undefined) out.gs_imp_percent = formatOneDecimalCell(row.relative_group_importance_percent);
    if (row.relative_case_importance_percent !== null && row.relative_case_importance_percent !== undefined) out.cc_imp_percent = formatOneDecimalCell(row.relative_case_importance_percent);
    return out;
  });
}

function relationshipReportRows(result: AnalyzeResponse, options: ReportOptions) {
  const rows = result.result?.relationship;
  if (!Array.isArray(rows)) return [];
  const topGroup = String(rows[0]?.group ?? '');
  return sortedRelationshipRows(rows, options.sortGroupsMode).map((row) => {
    const ranked = formatProbability(row.typicality_ranked);
    const rankText = row.typicality_rank && row.typicality_rank_denominator ? `${ranked} (${row.typicality_rank}/${row.typicality_rank_denominator})` : ranked;
    const out: Record<string, any> = {
      group: row.group ?? '—',
      classified_into: String(row.group ?? '') === topGroup ? topGroup : '',
      distance_from: formatNumber(row.d_squared),
      posterior: formatProbability(row.posterior_probability)
    };
    if (options.typicalityDisplay.f) out.typ_f = formatProbability(row.typicality_f);
    if (options.typicalityDisplay.chi) out.typ_chi = formatProbability(row.typicality_chi_square);
    if (options.typicalityDisplay.ranked) out.typ_r = rankText;
    return out;
  });
}


function classificationMatrixReportRows(result: AnalyzeResponse, options: ReportOptions) {
  const classification = result.result?.extended_results?.classification;
  if (!classification) return [];
  const rows = classificationMatrixRowsForDisplay(classification, options.classificationMatrixMode);
  const totalLine = classificationMatrixTotalLine(classification, result.result?.classification?.rate_estimation);
  if (totalLine) rows.push({ 'From Group': 'Total Correct', 'Total Number': String(totalLine).replace(/^Total Correct:\s*/i, '') });
  return rows;
}

function topStatureReportRows(result: AnalyzeResponse) {
  const rows = result.result?.top_results;
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, 25);
}

function htmlCellClass(title: string, column: string, value: any) {
  if (/^(FD4 Classification|Multigroup Classification)/i.test(title) && ['typ_chi_square', 'typ_f', 'typ_ranked'].includes(column)) {
    return typicalityEmphasisClass(value);
  }
  return '';
}

function reportCellHtml(column: string, value: any, isRelationshipTable: boolean) {
  const text = formatCell(value);
  if (!isRelationshipTable || !/^typ/i.test(column)) return escapeHtml(text);
  const className = typicalityEmphasisClass(value);
  return className ? `<span class="${className}">${escapeHtml(text)}</span>` : escapeHtml(text);
}

function relationshipReportHtml(title: string, rows: Array<Record<string, any>>) {
  if (!rows.length) return '';
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const hasF = columns.includes('typ_f');
  const hasChi = columns.includes('typ_chi');
  const hasR = columns.includes('typ_r');
  const probabilityColumns = ['posterior', ...(hasF ? ['typ_f'] : []), ...(hasChi ? ['typ_chi'] : []), ...(hasR ? ['typ_r'] : [])];
  return `<section class="report-section"><h2>${escapeHtml(title)}</h2><table class="report-table fd3-relationship-report-table"><caption class="sr-only">${escapeHtml(title)}</caption><thead><tr><th scope="col" rowspan="2">Group</th><th scope="col" rowspan="2">Classified<br/>into</th><th scope="col" rowspan="2">Distance<br/>from</th><th scope="colgroup" class="relationship-probability-header" colspan="${probabilityColumns.length}">Probabilities</th></tr><tr>${probabilityColumns.map((column) => `<th scope="col" class="relationship-probability-cell">${escapeHtml(column === 'posterior' ? 'Posterior' : column === 'typ_f' ? 'Typ. F' : column === 'typ_chi' ? 'Typ. χ²' : 'Typ. R')}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr><th scope="row">${escapeHtml(formatCell(row.group))}</th><td class="relationship-classified-cell">${escapeHtml(formatCell(row.classified_into))}</td><td class="relationship-distance-cell">${escapeHtml(formatCell(row.distance_from))}</td>${probabilityColumns.map((column) => `<td class="relationship-probability-cell">${reportCellHtml(column, row[column], true)}</td>`).join('')}</tr>`).join('')}</tbody></table></section>`;
}

function classificationMatrixReportHtml(title: string, rows: Array<Record<string, any>>) {
  if (!rows.length) return '';
  const totalRow = rows.find((row) => String(row['From Group'] ?? '').trim() === 'Total Correct');
  const bodyRows = totalRow ? rows.filter((row) => row !== totalRow) : rows;
  if (!bodyRows.length) return '';
  const columns = Array.from(new Set(bodyRows.flatMap((row) => Object.keys(row))));
  const groupColumns = columns.filter((column) => !['From Group', 'Total Number', 'Correct'].includes(column));
  const totalText = totalRow ? `Total Correct: ${String(totalRow['Total Number'] ?? '').trim()}` : '';
  const modeLabel = /%/.test(title) ? '(%)' : '(counts)';
  return `<section class="report-section"><h2>${escapeHtml(title)}</h2><table class="report-table fd3-classification-matrix-report-table"><caption class="sr-only">${escapeHtml(title)}</caption><thead><tr><th scope="col" rowspan="2">From<br/>Group</th><th scope="col" rowspan="2">Total<br/>Number</th><th scope="colgroup" class="fd3-matrix-into-group-header" colspan="${Math.max(groupColumns.length, 1)}">Into Group ${escapeHtml(modeLabel)}</th><th scope="col" rowspan="2">Correct</th></tr><tr>${groupColumns.map((column) => `<th scope="col">${escapeHtml(column)}</th>`).join('')}</tr></thead><tbody>${bodyRows.map((row) => `<tr><th scope="row">${escapeHtml(formatCell(row['From Group']))}</th><td class="fd3-matrix-total-number">${escapeHtml(formatCell(row['Total Number']))}</td>${groupColumns.map((column) => `<td class="fd3-matrix-group-value">${escapeHtml(formatCell(row[column]))}</td>`).join('')}<td class="fd3-matrix-correct">${escapeHtml(formatCell(row.Correct))}</td></tr>`).join('')}</tbody>${totalText ? `<tfoot><tr><td colspan="${Math.max(columns.length, 1)}" class="fd3-matrix-total-correct-line">${escapeHtml(totalText)}</td></tr></tfoot>` : ''}</table></section>`;
}

function htmlTable(title: string, rows: Array<Record<string, any>>, statureUnits: StatureUnits = 'in') {
  if (!rows.length) return '';
  const isClassificationMatrix = /^Classification Matrix/i.test(title);
  if (isClassificationMatrix) return classificationMatrixReportHtml(title, rows);
  if (title === 'Multigroup Classification') return relationshipReportHtml(title, rows);
  const isRelationshipTable = title === 'FD4 Classification' || title === 'Multigroup Classification';
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).filter((column) => !column.startsWith('__'));
  const tableClass = title === 'Measurement Checks'
    ? 'report-table measurement-check-report-table'
    : 'report-table';
  const bodyRows = rows.map((row) => {
    const deviationClass = title === 'Measurement Checks' ? measurementDeviationClass(row.__deviation) : '';
    const explicitOutlierWarning = title === 'Warnings and Checks' && /outlier/i.test(String(row.type ?? ''));
    const outlierClass = /^Reference Outliers/i.test(title) || referenceRowHasOutlierFlag(row) || explicitOutlierWarning ? 'reference-outlier-row' : '';
    const rowClass = [deviationClass, outlierClass].filter(Boolean).join(' ');
    return `<tr${rowClass ? ` class="${rowClass}"` : ''}>${columns.map((column, columnIndex) => {
      const measurementCellClass = title === 'Measurement Checks' && ['current_case', 'check'].includes(column) ? ' measurement-deviation-value' : '';
      const content = reportCellHtml(column, formatTableCell(title, column, row[column], statureUnits), isRelationshipTable);
      return columnIndex === 0
        ? `<th scope="row" class="${measurementCellClass.trim()}">${content}</th>`
        : `<td class="${measurementCellClass.trim()}">${content}</td>`;
    }).join('')}</tr>`;
  }).join('');
  return `<section class="report-section"><h2>${escapeHtml(title)}</h2><table class="${tableClass}"><caption class="sr-only">${escapeHtml(title)}</caption><thead><tr>${columns.map((column) => `<th scope="col">${escapeHtml(statureAwareTableHeader(title, column, statureUnits))}</th>`).join('')}</tr></thead><tbody>${bodyRows}</tbody></table></section>`;
}

function textTable(title: string, rows: Array<Record<string, any>>, statureUnits: StatureUnits = 'in') {
  if (!rows.length) return '';
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).filter((column) => !column.startsWith('__'));
  return [
    `\n${title}`,
    columns.map((column) => statureAwareTableHeader(title, column, statureUnits)).join('\t'),
    ...rows.map((row) => columns.map((column) => String(formatTableCell(title, column, row[column], statureUnits))).join('\t'))
  ].join('\n');
}


function buildReportGraphHtml(result: AnalyzeResponse, statureUnits: StatureUnits = 'in') {
  const figures = buildReportGraphObjects(result, statureUnits);
  if (!figures.length) return '';
  return `<section class="report-graphs"><h2>Graph Snapshots</h2>${figures.map((figure) => `<figure class="report-graph"><figcaption>${escapeHtml(figure.title)}</figcaption>${figure.content}</figure>`).join('')}</section>`;
}

function ensureSvgDocument(svg: string) {
  const clean = String(svg ?? '').trim();
  if (!clean) return '';
  return clean.startsWith('<?xml') ? clean : `<?xml version="1.0" encoding="UTF-8"?>\n${clean}`;
}

function buildReportGraphFiles(result: AnalyzeResponse, baseName: string, statureUnits: StatureUnits = 'in') {
  return buildReportGraphObjects(result, statureUnits).map((figure) => ({ name: `graphs/${baseName}_${figure.fileName}`, content: ensureSvgDocument(figure.content) }));
}

function buildReportGraphObjects(result: AnalyzeResponse, statureUnits: StatureUnits = 'in'): CaseReportGraphSnapshot[] {
  const figures: CaseReportGraphSnapshot[] = [];
  const colorMap = reportGraphColorMap(result);
  const dfaSvg = buildReportDfaSvg(result, colorMap);
  if (dfaSvg) figures.push({ title: result.operation === 'custom_reference_dfa' ? 'Custom Reference DFA Graph Snapshot' : 'DFA Graph Snapshot', fileName: 'dfa_graph.svg', content: dfaSvg });
  const ternarySvg = buildReportTernarySvg(result, colorMap);
  if (ternarySvg) figures.push({ title: 'Ternary Plot Snapshot', fileName: 'ternary_plot.svg', content: ternarySvg });
  const dendrogramSvg = buildReportDendrogramSvg(result, colorMap);
  if (dendrogramSvg) figures.push({ title: 'Dendrogram Snapshot', fileName: 'dendrogram.svg', content: dendrogramSvg });
  const threeD = buildReportCanonical3dSvg(result, colorMap);
  if (threeD) figures.push({ title: '3D Canonical Plot Snapshot', fileName: 'canonical_3d_plot.svg', content: threeD });

  const selectedStatureGraph = getReportSelectedStatureGraph(result);
  const selectedStatureSvg = selectedStatureGraph ? buildReportSelectedStatureScatterSvg(selectedStatureGraph, statureUnits) : '';
  if (selectedStatureSvg) figures.push({ title: 'Selected Stature Equation Snapshot', fileName: 'selected_stature_equation.svg', content: selectedStatureSvg });
  const statureIntervalSvg = buildReportStatureIntervalSvg(result, statureUnits);
  if (statureIntervalSvg) figures.push({ title: 'Stature Estimate Interval Snapshot', fileName: 'stature_estimate_intervals.svg', content: statureIntervalSvg });
  return figures;
}

function buildRunLogGraphSnapshots(result: AnalyzeResponse, statureUnits: StatureUnits): CaseReportGraphSnapshot[] {
  try {
    return buildReportGraphObjects(result, statureUnits).map((snapshot) => ({ ...snapshot }));
  } catch (error) {
    console.warn('FORDISC could not retain report graph snapshots for this completed run.', error);
    return [];
  }
}

function reportPointNumber(point: Record<string, any>, key: string) {
  const value = Number(point?.[key]);
  return Number.isFinite(value) ? value : null;
}

function reportPointGroup(point: Record<string, any>) {
  return String(point?.Pop ?? point?.group ?? point?._row ?? '?');
}

function reportGraphColorMap(result: AnalyzeResponse): GraphColorMap {
  const graphData = result.result?.graph_data ?? result.result?.extended_results ?? {};
  const labels: string[] = Array.isArray(result.result?.groups) ? result.result.groups.map(String) : [];
  for (const key of ['reference_canonical_scores', 'group_mean_canonical_scores', 'reference_posterior_probabilities']) {
    const rows = Array.isArray(graphData?.[key]) ? graphData[key] : [];
    labels.push(...rows.map((row: Record<string, any>) => reportPointGroup(row)).filter((label: string) => label && label !== '?'));
  }
  const pairwiseRows = Array.isArray(graphData?.pairwise_mahalanobis) ? graphData.pairwise_mahalanobis : [];
  labels.push(...pairwiseRows.map((row: Record<string, any>) => String(row.Group ?? row.Pop ?? row.group ?? '')).filter(Boolean));
  const relationshipRows = Array.isArray(result.result?.relationship) ? result.result.relationship : [];
  labels.push(...relationshipRows.map((row: Record<string, any>) => String(row.group ?? '')).filter(Boolean));
  return buildGraphColorMap(labels);
}

function scaleLinear(value: number, min: number, max: number, outMin: number, outMax: number) {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || min === max) return (outMin + outMax) / 2;
  return outMin + ((value - min) / (max - min)) * (outMax - outMin);
}

function buildReportDfaSvg(result: AnalyzeResponse, colorMap: GraphColorMap) {
  const ext = result.result?.extended_results ?? {};
  const referencePoints = Array.isArray(ext.reference_canonical_scores) ? ext.reference_canonical_scores : [];
  const centroids = Array.isArray(ext.group_mean_canonical_scores) ? ext.group_mean_canonical_scores : [];
  const casePointRaw = ext.case_canonical_score ?? result.result?.case_canonical_score ?? null;
  const casePoint = Array.isArray(casePointRaw) ? casePointRaw[0] : casePointRaw;
  const module = reportGraphModule(result);
  const groupLabels = Array.from(new Set(referencePoints.map((point: Record<string, any>) => reportPointGroup(point)).filter(Boolean)));
  if (referencePoints.length && groupLabels.length === 2) {
    return buildReportTwoGroupHistogramSvg(referencePoints, casePoint ?? null, module, colorMap);
  }
  if ((referencePoints.length || centroids.length) && casePoint && reportPointNumber(casePoint, 'LD1') !== null && reportPointNumber(casePoint, 'LD2') !== null) {
    const eigenvalueProportions = Array.isArray(result.result?.model_summary?.eigenvalue_proportions)
      ? result.result.model_summary.eigenvalue_proportions
      : Array.isArray(ext?.model?.eigenvalue_proportions) ? ext.model.eigenvalue_proportions : [];
    return buildReportCanonicalScatterSvg(referencePoints, centroids, casePoint, module, colorMap, eigenvalueProportions, -1);
  }
  const relationshipSvg = buildReportRelationshipSvg(result, module, colorMap);
  if (relationshipSvg) return relationshipSvg;
  return '';
}

function buildReportRelationshipSvg(result: AnalyzeResponse, module: ModuleId, colorMap: GraphColorMap) {
  const rows = Array.isArray(result.result?.relationship) ? sortedRelationshipRows(result.result.relationship, 'distance').slice(0, 12) : [];
  if (!rows.length) return '';
  const relationshipLabels = rows.map((row: Record<string, any>) => String(row.group ?? '—'));
  const chartLeft = Math.min(210, svgLabelColumnLeft(relationshipLabels, 95, 210));
  const chart = { left: chartLeft, top: 42, width: 525 - chartLeft, rowHeight: 24 };
  const height = chart.top + rows.length * chart.rowHeight + 56;
  const maxD2 = Math.max(1, ...rows.map((row: Record<string, any>) => Number(row.d_squared) || 0));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 650 ${height}" role="img" aria-label="Multigroup classification relationship chart">
    <rect width="650" height="${height}" fill="#ffffff"/>
    <text x="325" y="24" text-anchor="middle" font-size="16" font-weight="700" fill="#172b3d">Multigroup Classification</text>
    ${rows.map((row: Record<string, any>, index: number) => {
      const group = String(row.group ?? '—');
      const d2 = Number(row.d_squared) || 0;
      const posterior = Number(row.posterior_probability);
      const y = chart.top + index * chart.rowHeight;
      const barWidth = Math.max(2, (d2 / maxD2) * chart.width);
      return `<g><text x="${chart.left - 10}" y="${y + 15}" text-anchor="end" font-size="11" font-weight="700" fill="#334155">${escapeHtml(group)}</text><rect x="${chart.left}" y="${y + 4}" width="${barWidth.toFixed(2)}" height="14" fill="${graphColorFor(group, module, colorMap)}" opacity="0.75"/><text x="${(chart.left + barWidth + 6).toFixed(2)}" y="${y + 15}" font-size="11" fill="#334155">D² ${formatNumber(d2)}${Number.isFinite(posterior) ? ` · PP ${formatProbability(posterior)}` : ''}</text></g>`;
    }).join('')}
  </svg>`;
}

function buildReportTwoGroupHistogramSvg(referencePoints: Array<Record<string, any>>, casePoint: Record<string, any> | null, module: ModuleId, colorMap: GraphColorMap) {
  const points = referencePoints
    .map((point, index) => ({ id: String(point.RecID ?? point.ID ?? index), group: reportPointGroup(point), score: reportPointNumber(point, 'LD1') }))
    .filter((point) => point.score !== null) as Array<{ id: string; group: string; score: number }>;
  const groups = Array.from(new Set(points.map((point) => point.group))).slice(0, 2);
  const caseScore = casePoint ? reportPointNumber(casePoint, 'LD1') : null;
  if (groups.length !== 2 || !points.length) return '';
  const binWidth = 0.5;
  const scores = [...points.map((point) => point.score), ...(caseScore !== null ? [caseScore] : [])];
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const start = Math.floor(minScore / binWidth) * binWidth - binWidth;
  const end = Math.ceil(maxScore / binWidth) * binWidth + binWidth;
  const bins: number[] = [];
  for (let edge = start; edge <= end + binWidth * 0.5; edge += binWidth) bins.push(Number(edge.toFixed(6)));
  const groupTotals = new Map(groups.map((group) => [group, points.filter((point) => point.group === group).length]));
  const bars: Array<{ group: string; binStart: number; proportion: number; count: number; binIndex: number; groupIndex: number }> = [];
  bins.slice(0, -1).forEach((binStart, binIndex) => {
    const binEnd = bins[binIndex + 1];
    groups.forEach((group, groupIndex) => {
      const count = points.filter((point) => point.group === group && point.score >= binStart && point.score < binEnd).length;
      const total = Math.max(groupTotals.get(group) ?? 1, 1);
      bars.push({ group, binStart, proportion: count / total, count, binIndex, groupIndex });
    });
  });
  const chart = { left: 62, top: 70, width: 560, height: 248 };
  const maxProp = Math.max(0.05, ...bars.map((bar) => bar.proportion));
  const yMax = Math.ceil((maxProp + 0.02) * 10) / 10;
  const scaleX = (x: number) => scaleLinear(x, start, end, chart.left, chart.left + chart.width);
  const scaleY = (y: number) => chart.top + chart.height - (y / yMax) * chart.height;
  const barGap = Math.max(1, (scaleX(start + binWidth) - scaleX(start)) * 0.08);
  const barWidth = Math.max(2, ((scaleX(start + binWidth) - scaleX(start)) - barGap * 3) / 2);
  const caseX = caseScore !== null ? scaleX(caseScore) : null;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 380" role="img" aria-label="Two-group discriminant function histogram">
    <rect width="700" height="380" fill="#ffffff"/>
    <text x="350" y="26" text-anchor="middle" font-size="16" font-weight="700" fill="#172b3d">Two-group discriminant function results</text>
    <line x1="${chart.left}" x2="${chart.left + chart.width}" y1="${chart.top + chart.height}" y2="${chart.top + chart.height}" stroke="#222" stroke-width="1"/>
    <line x1="${chart.left}" x2="${chart.left}" y1="${chart.top}" y2="${chart.top + chart.height}" stroke="#222" stroke-width="1"/>
    ${start < 0 && end > 0 ? `<line x1="${scaleX(0).toFixed(2)}" x2="${scaleX(0).toFixed(2)}" y1="${chart.top}" y2="${chart.top + chart.height}" stroke="#111827" stroke-width="2.5"/>` : ''}
    ${bars.filter((bar) => bar.count > 0).map((bar) => {
      const x = scaleX(bar.binStart) + barGap + bar.groupIndex * (barWidth + barGap);
      const y = scaleY(bar.proportion);
      return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${(chart.top + chart.height - y).toFixed(2)}" fill="${graphColorFor(bar.group, module, colorMap)}" opacity="0.92"/>`;
    }).join('')}
    ${caseX !== null ? `<line x1="${caseX.toFixed(2)}" x2="${caseX.toFixed(2)}" y1="${chart.top}" y2="${chart.top + chart.height}" stroke="#111" stroke-width="2" stroke-dasharray="5 5"/><rect x="${(caseX - 8).toFixed(2)}" y="${chart.top + chart.height - 22}" width="16" height="16" fill="#fff" stroke="#111"/><text x="${caseX.toFixed(2)}" y="${chart.top + chart.height - 9}" text-anchor="middle" font-size="11" font-weight="700">X</text>` : ''}
    <text x="20" y="${chart.top - 8}" font-size="12" font-weight="700" fill="#172b3d">Proportion</text>
    <text x="350" y="360" text-anchor="middle" font-size="12" font-weight="700" fill="#172b3d">${caseScore !== null ? `DF Score = ${caseScore.toFixed(2)}; ` : ''}sectioning point = 0</text>
    ${groups.map((group, index) => `<g transform="translate(${index === 0 ? 62 : 360} 42)"><rect width="10" height="10" fill="${graphColorFor(group, module, colorMap)}"/><text x="18" y="10" font-size="12" font-weight="700" fill="#172b3d">${escapeHtml(group)} (${groupTotals.get(group) ?? 0})</text></g>`).join('')}
  </svg>`;
}

function buildReportCanonicalScatterSvg(
  referencePoints: Array<Record<string, any>>,
  centroids: Array<Record<string, any>>,
  casePoint: Record<string, any>,
  module: ModuleId,
  colorMap: GraphColorMap,
  eigenvalueProportions: any[] = [],
  orientationMultiplier = -1
) {
  const valueFor = (point: Record<string, any>, key: string) => {
    const value = reportPointNumber(point, key);
    return value === null ? null : value * orientationMultiplier;
  };
  const allPoints = [...referencePoints, ...centroids, casePoint].filter(Boolean);
  const xs = allPoints.map((point) => valueFor(point, 'LD1')).filter((value): value is number => value !== null);
  const ys = allPoints.map((point) => valueFor(point, 'LD2')).filter((value): value is number => value !== null);
  if (!xs.length || !ys.length) return '';
  const padX = Math.max(0.5, (Math.max(...xs) - Math.min(...xs)) * 0.08);
  const padY = Math.max(0.5, (Math.max(...ys) - Math.min(...ys)) * 0.08);
  const minX = Math.min(...xs) - padX;
  const maxX = Math.max(...xs) + padX;
  const minY = Math.min(...ys) - padY;
  const maxY = Math.max(...ys) + padY;
  const chart = { left: 72, top: 34, width: 510, height: 300 };
  const scaleX = (x: number) => scaleLinear(x, minX, maxX, chart.left, chart.left + chart.width);
  const scaleY = (y: number) => scaleLinear(y, minY, maxY, chart.top + chart.height, chart.top);
  const xTicks = niceTickValues(minX, maxX, 6);
  const yTicks = niceTickValues(minY, maxY, 6);
  const reportReferencePlotPoints = referencePoints
    .map((point) => {
      const x = valueFor(point, 'LD1');
      const y = valueFor(point, 'LD2');
      return x === null || y === null ? null : { label: reportPointGroup(point), x, y };
    })
    .filter((point): point is { label: string; x: number; y: number } => Boolean(point));
  const reportEllipses = buildCanonicalEllipses(reportReferencePlotPoints, scaleX, scaleY, module, colorMap);
  const ellipseElements = reportEllipses.map((ellipse) => `<ellipse cx="${ellipse.cx.toFixed(2)}" cy="${ellipse.cy.toFixed(2)}" rx="${ellipse.rx.toFixed(2)}" ry="${ellipse.ry.toFixed(2)}" transform="rotate(${ellipse.angle.toFixed(2)} ${ellipse.cx.toFixed(2)} ${ellipse.cy.toFixed(2)})" fill="${ellipse.color}" fill-opacity="0.08" stroke="${ellipse.color}" stroke-opacity="0.65" stroke-width="1.2"/>`).join('');
  const refElements = referencePoints.slice(0, 1400).map((point) => {
    const x = valueFor(point, 'LD1'); const y = valueFor(point, 'LD2');
    if (x === null || y === null) return '';
    const group = reportPointGroup(point);
    return `<circle cx="${scaleX(x).toFixed(2)}" cy="${scaleY(y).toFixed(2)}" r="1.8" fill="${graphColorFor(group, module, colorMap)}" opacity="0.45"/>`;
  }).join('');
  const centroidElements = centroids.map((point) => {
    const x = valueFor(point, 'LD1'); const y = valueFor(point, 'LD2');
    if (x === null || y === null) return '';
    const group = reportPointGroup(point);
    const centroidX = scaleX(x);
    const labelOnLeft = centroidX > 325;
    return `<g><circle cx="${centroidX.toFixed(2)}" cy="${scaleY(y).toFixed(2)}" r="6" fill="${graphColorFor(group, module, colorMap)}" stroke="#111" stroke-width="1.4"/><text x="${(centroidX + (labelOnLeft ? -8 : 8)).toFixed(2)}" y="${(scaleY(y)+4).toFixed(2)}" text-anchor="${labelOnLeft ? 'end' : 'start'}" font-size="11" font-weight="700" fill="#172b3d">${escapeHtml(group)}</text></g>`;
  }).join('');
  const caseX = valueFor(casePoint, 'LD1');
  const caseY = valueFor(casePoint, 'LD2');
  const caseElement = caseX !== null && caseY !== null ? `<g><circle cx="${scaleX(caseX).toFixed(2)}" cy="${scaleY(caseY).toFixed(2)}" r="7" fill="#111" stroke="#fff" stroke-width="2"/><text x="${(scaleX(caseX)+10).toFixed(2)}" y="${(scaleY(caseY)-8).toFixed(2)}" font-size="12" font-weight="700" fill="#111">Case</text></g>` : '';
  const xLabel = canonicalAxisDisplayLabel('LD1', eigenvalueProportions);
  const yLabel = canonicalAxisDisplayLabel('LD2', eigenvalueProportions);
  const xGrid = xTicks.map((tick) => `<g><line x1="${scaleX(tick).toFixed(2)}" x2="${scaleX(tick).toFixed(2)}" y1="${chart.top}" y2="${chart.top + chart.height}" stroke="#e3e9ef" stroke-width="0.8"/><text x="${scaleX(tick).toFixed(2)}" y="350" text-anchor="middle" font-size="9" fill="#526779">${escapeHtml(formatGraphTick(tick))}</text></g>`).join('');
  const yGrid = yTicks.map((tick) => `<g><line x1="${chart.left}" x2="${chart.left + chart.width}" y1="${scaleY(tick).toFixed(2)}" y2="${scaleY(tick).toFixed(2)}" stroke="#e3e9ef" stroke-width="0.8"/><text x="64" y="${(scaleY(tick)+3).toFixed(2)}" text-anchor="end" font-size="9" fill="#526779">${escapeHtml(formatGraphTick(tick))}</text></g>`).join('');
  const zeroLines = `${minX < 0 && maxX > 0 ? `<line x1="${scaleX(0).toFixed(2)}" x2="${scaleX(0).toFixed(2)}" y1="${chart.top}" y2="${chart.top + chart.height}" stroke="#aebdca" stroke-width="1.2" stroke-dasharray="4 5"/>` : ''}${minY < 0 && maxY > 0 ? `<line x1="${chart.left}" x2="${chart.left + chart.width}" y1="${scaleY(0).toFixed(2)}" y2="${scaleY(0).toFixed(2)}" stroke="#aebdca" stroke-width="1.2" stroke-dasharray="4 5"/>` : ''}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 650 390" role="img" aria-label="Canonical scatterplot">
    <rect width="650" height="390" fill="#ffffff"/>
    <text x="325" y="24" text-anchor="middle" font-size="16" font-weight="700" fill="#172b3d">Canonical Scatterplot</text>
    ${xGrid}${yGrid}${zeroLines}
    <line x1="${chart.left}" x2="${chart.left + chart.width}" y1="${chart.top + chart.height}" y2="${chart.top + chart.height}" stroke="#222"/>
    <line x1="${chart.left}" x2="${chart.left}" y1="${chart.top}" y2="${chart.top + chart.height}" stroke="#222"/>
    <text x="${chart.left + chart.width / 2}" y="378" text-anchor="middle" font-size="12" font-weight="700">${escapeHtml(xLabel)}</text>
    <text x="18" y="${chart.top + chart.height / 2}" transform="rotate(-90 18 ${chart.top + chart.height / 2})" text-anchor="middle" font-size="12" font-weight="700">${escapeHtml(yLabel)}</text>
    ${ellipseElements}${refElements}${centroidElements}${caseElement}
  </svg>`;
}

function buildReportTernarySvg(result: AnalyzeResponse, colorMap: GraphColorMap) {
  const ext = result.result?.extended_results ?? {};
  const rows = Array.isArray(ext.reference_posterior_probabilities) ? ext.reference_posterior_probabilities : [];
  if (!rows.length) return '';
  const groups = Array.from(new Set(rows.map((row: Record<string, any>) => reportPointGroup(row)).filter(Boolean))) as string[];
  if (groups.length !== 3) return '';
  const module = reportGraphModule(result);
  const vertices = ternaryVerticesForLabels(groups);
  const normalize = (row: Record<string, any>) => {
    const probs = groups.map((group) => Math.max(0, Number(row[group] ?? 0)));
    const sum = probs.reduce((acc, value) => acc + value, 0);
    return Number.isFinite(sum) && sum > 0 ? probs.map((value) => value / sum) : null;
  };
  const pointFor = (weights: number[]) => ({
    x: weights[0] * vertices[0].x + weights[1] * vertices[1].x + weights[2] * vertices[2].x,
    y: weights[0] * vertices[0].y + weights[1] * vertices[1].y + weights[2] * vertices[2].y
  });
  const pointElements = rows.slice(0, 1600).map((row: Record<string, any>, index: number) => {
    const weights = normalize(row);
    if (!weights) return '';
    const point = pointFor(weights);
    const group = reportPointGroup(row);
    return `<circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="3" fill="${graphColorFor(group, module, colorMap)}" fill-opacity="0.85"/>`;
  }).join('');
  const caseRaw = Array.isArray(ext.case_posterior_probabilities) ? ext.case_posterior_probabilities[0] : ext.case_posterior_probabilities;
  const caseWeights = caseRaw ? normalize(caseRaw) : null;
  const casePoint = caseWeights ? pointFor(caseWeights) : null;
  const caseElement = casePoint ? `<g transform="translate(${casePoint.x.toFixed(2)} ${casePoint.y.toFixed(2)})"><path d="M 0 -10 L 10 0 L 0 10 L -10 0 Z" fill="#111827" stroke="#facc15" stroke-width="2"/><text x="13" y="5" font-size="12" font-weight="700">Case</text></g>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 530" role="img" aria-label="Ternary posterior probability plot">
    <rect width="700" height="530" fill="#ffffff"/>
    <text x="350" y="28" text-anchor="middle" font-size="16" font-weight="700" fill="#172b3d">Ternary Plot</text>
    <polygon points="${vertices.map((v) => `${v.x},${v.y}`).join(' ')}" fill="#ffffff" stroke="#111" stroke-width="1.6"/>
    ${pointElements}${caseElement}
    ${groups.map((group, index) => `<text x="${vertices[index].x}" y="${vertices[index].y + (index === 2 ? -14 : 30)}" text-anchor="middle" font-size="14" font-weight="900" fill="${graphColorFor(group, module, colorMap)}">${escapeHtml(group)}</text>`).join('')}
  </svg>`;
}

function buildReportDendrogramSvg(result: AnalyzeResponse, colorMap: GraphColorMap) {
  const ext = result.result?.extended_results ?? {};
  const centroids = Array.isArray(ext.group_mean_canonical_scores) ? ext.group_mean_canonical_scores : [];
  const matrixRows = Array.isArray(ext.pairwise_mahalanobis) ? ext.pairwise_mahalanobis : [];
  const matrix = centroids.length >= 2 ? buildCentroidSquaredDistanceMatrix(centroids) : normalizePairwiseMatrix(matrixRows);
  if (matrix.labels.length < 3) return '';
  const module = reportGraphModule(result);
  const tree = buildAverageLinkageTree(matrix.labels, matrix.distances);
  const leaves = collectClusterLeaves(tree);
  const chartLeft = svgLabelColumnLeft(leaves);
  const chart = { left: chartLeft, right: 650, top: 44, width: 650 - chartLeft, height: 271 };
  const labelX = chart.left - 12;
  const yStep = leaves.length > 1 ? chart.height / (leaves.length - 1) : chart.height;
  const leafY = new Map(leaves.map((label, index) => [label, chart.top + index * yStep]));
  const maxHeight = Math.max(tree.height, 1);
  const xFor = (height: number) => chart.left + (height / maxHeight) * chart.width;
  const paths: string[] = [];
  const drawNode = (node: ClusterNode): { x: number; y: number } => {
    if (!node.children.length) return { x: chart.left, y: leafY.get(node.labels[0]) ?? chart.top };
    const left = drawNode(node.children[0]);
    const right = drawNode(node.children[1]);
    const x = xFor(node.height);
    paths.push(`<line x1="${left.x.toFixed(2)}" y1="${left.y.toFixed(2)}" x2="${x.toFixed(2)}" y2="${left.y.toFixed(2)}" stroke="#111" stroke-width="1.55" stroke-linecap="square" shape-rendering="crispEdges"/>`);
    paths.push(`<line x1="${right.x.toFixed(2)}" y1="${right.y.toFixed(2)}" x2="${x.toFixed(2)}" y2="${right.y.toFixed(2)}" stroke="#111" stroke-width="1.55" stroke-linecap="square" shape-rendering="crispEdges"/>`);
    paths.push(`<line x1="${x.toFixed(2)}" y1="${Math.min(left.y, right.y).toFixed(2)}" x2="${x.toFixed(2)}" y2="${Math.max(left.y, right.y).toFixed(2)}" stroke="#111" stroke-width="1.55" stroke-linecap="square" shape-rendering="crispEdges"/>`);
    return { x, y: (left.y + right.y) / 2 };
  };
  drawNode(tree);
  const ticks = [0, maxHeight / 3, maxHeight * 2 / 3, maxHeight];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 405" role="img" aria-label="Dendrogram of group relationships">
    <rect width="700" height="405" fill="#ffffff"/>
    <text x="350" y="24" text-anchor="middle" font-size="16" font-weight="900" fill="#102538">Dendrogram of Group Relationships</text>
    <g stroke="#111" stroke-width="1.55" stroke-linecap="square" shape-rendering="crispEdges">${paths.join('')}</g>
    ${leaves.map((label) => `<text x="${labelX}" y="${((leafY.get(label) ?? 0) + 5).toFixed(2)}" text-anchor="end" font-size="14" font-weight="900" fill="${graphColorFor(label, module, colorMap)}">${escapeHtml(label)}</text>`).join('')}
    <line x1="${chart.left}" x2="${chart.right}" y1="340" y2="340" stroke="#111" stroke-width="1.55" shape-rendering="crispEdges"/>
    ${ticks.map((tick) => `<g><line x1="${xFor(tick).toFixed(2)}" x2="${xFor(tick).toFixed(2)}" y1="336" y2="344" stroke="#111" stroke-width="1.55"/><text x="${xFor(tick).toFixed(2)}" y="362" text-anchor="middle" font-size="11">${tick.toFixed(tick < 10 ? 1 : 0)}</text></g>`).join('')}
    <text x="${(chart.left + chart.right) / 2}" y="390" text-anchor="middle" font-size="12" font-weight="700">Mahalanobis Distance</text>
  </svg>`;
}

function buildReportCanonical3dSvg(result: AnalyzeResponse, colorMap: GraphColorMap) {
  const ext = result.result?.extended_results ?? {};
  const referencePoints = Array.isArray(ext.reference_canonical_scores) ? ext.reference_canonical_scores : [];
  if (!referencePoints.some((point: Record<string, any>) => reportPointNumber(point, 'LD3') !== null)) return '';
  const centroids = Array.isArray(ext.group_mean_canonical_scores) ? ext.group_mean_canonical_scores : [];
  const caseRaw = ext.case_canonical_score ?? result.result?.case_canonical_score ?? null;
  const casePoint = Array.isArray(caseRaw) ? caseRaw[0] : caseRaw;
  const module = reportGraphModule(result);
  const points = referencePoints.map((point: Record<string, any>, index: number) => ({ id: String(point.RecID ?? index), group: reportPointGroup(point), x: reportPointNumber(point, 'LD1'), y: reportPointNumber(point, 'LD2'), z: reportPointNumber(point, 'LD3'), kind: 'reference' })).filter((point: any) => point.x !== null && point.y !== null && point.z !== null);
  const centroidPoints = centroids.map((point: Record<string, any>) => ({ id: reportPointGroup(point), group: reportPointGroup(point), x: reportPointNumber(point, 'LD1'), y: reportPointNumber(point, 'LD2'), z: reportPointNumber(point, 'LD3'), kind: 'centroid' })).filter((point: any) => point.x !== null && point.y !== null && point.z !== null);
  const case3d = casePoint ? { id: 'case', group: 'Case', x: reportPointNumber(casePoint, 'LD1'), y: reportPointNumber(casePoint, 'LD2'), z: reportPointNumber(casePoint, 'LD3'), kind: 'case' } : null;
  const all = [...points, ...centroidPoints, ...(case3d && case3d.x !== null && case3d.y !== null && case3d.z !== null ? [case3d] : [])];
  if (!all.length) return '';
  const angleX = 28 * Math.PI / 180;
  const angleZ = -38 * Math.PI / 180;
  const zoom = 0.86;
  const projectRaw = (x: number, y: number, z: number) => {
    const xz = x * Math.cos(angleZ) - y * Math.sin(angleZ);
    const yz = x * Math.sin(angleZ) + y * Math.cos(angleZ);
    const yy = yz * Math.cos(angleX) - z * Math.sin(angleX);
    const zz = yz * Math.sin(angleX) + z * Math.cos(angleX);
    return { x: xz, y: yy, z: zz };
  };
  const projected = all.map((point: any) => ({ ...point, ...projectRaw(Number(point.x), Number(point.y), Number(point.z)) })).sort((a: any, b: any) => a.z - b.z);
  const xs = projected.map((point: any) => point.x); const ys = projected.map((point: any) => point.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const scaleX = (x: number) => 330 + ((x - (minX + maxX) / 2) / Math.max(maxX - minX, 0.001)) * 430 * zoom;
  const scaleY = (y: number) => 205 - ((y - (minY + maxY) / 2) / Math.max(maxY - minY, 0.001)) * 270 * zoom;
  const axisLength = 150 * zoom;
  const axis = [{ label: 'CV 1', x: 1, y: 0, z: 0 }, { label: 'CV 2', x: 0, y: 1, z: 0 }, { label: 'CV 3', x: 0, y: 0, z: 1 }].map((a) => ({ ...a, ...projectRaw(a.x, a.y, a.z) }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 430" role="img" aria-label="3D canonical scatterplot">
    <rect width="700" height="430" fill="#ffffff"/>
    <text x="350" y="24" text-anchor="middle" font-size="16" font-weight="700" fill="#172b3d">3D Canonical Plot</text>
    ${axis.map((a) => `<g><line x1="350" y1="215" x2="${(350 + a.x * axisLength).toFixed(2)}" y2="${(215 - a.y * axisLength).toFixed(2)}" stroke="#111" stroke-width="1"/><text x="${(350 + a.x * (axisLength + 14)).toFixed(2)}" y="${(215 - a.y * (axisLength + 14)).toFixed(2)}" font-size="12" font-weight="700" fill="#000080">${a.label}</text></g>`).join('')}
    ${projected.slice(0, 1800).map((point: any) => {
      const color = point.kind === 'case' ? '#111827' : graphColorFor(point.group, module, colorMap);
      const x = scaleX(point.x), y = scaleY(point.y);
      if (point.kind === 'centroid') {
        const labelOnLeft = x > 350;
        return `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)})"><rect x="-5" y="-5" width="10" height="10" fill="${color}" stroke="#111"/><text x="${labelOnLeft ? -10 : 10}" y="4" text-anchor="${labelOnLeft ? 'end' : 'start'}" font-size="11" font-weight="700">${escapeHtml(point.group)}</text></g>`;
      }
      if (point.kind === 'case') return `<path d="M ${x.toFixed(2)} ${(y - 9).toFixed(2)} L ${(x + 9).toFixed(2)} ${y.toFixed(2)} L ${x.toFixed(2)} ${(y + 9).toFixed(2)} L ${(x - 9).toFixed(2)} ${y.toFixed(2)} Z" fill="${color}" stroke="#facc15" stroke-width="2"/>`;
      return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="2.5" fill="${color}" fill-opacity="0.82"/>`;
    }).join('')}
  </svg>`;
}

function getReportSelectedStatureGraph(result: AnalyzeResponse) {
  const rawGraphs = result.result?.stature_graphs ?? result.result?.selected_equation_graphs ?? result.result?.extended_results?.selected_equation_graphs ?? result.result?.extended_results?.stature?.selected_equation_graphs;
  const graphs = Array.isArray(rawGraphs) ? rawGraphs.filter((graph: Record<string, any>) => graph && !graph.error) : [];
  const fallback = result.result?.stature_graph ?? result.result?.selected_equation_graph ?? result.result?.extended_results?.selected_equation_graph ?? result.result?.extended_results?.stature?.selected_equation_graph;
  return graphs[0] ?? fallback ?? null;
}

function buildReportSelectedStatureScatterSvg(graph: Record<string, any>, statureUnits: StatureUnits = 'in') {
  const statureFactor = statureUnits === 'cm' ? INCH_TO_CM : 1;
  const referencePoints = Array.isArray(graph.reference_points) ? graph.reference_points : [];
  const lineRows = Array.isArray(graph.regression_line) ? graph.regression_line : [];
  const casePointRaw = Array.isArray(graph.case_point) ? graph.case_point[0] : graph.case_point;
  const casePoint = casePointRaw ?? {};
  const pointData = referencePoints
    .map((row: Record<string, any>) => ({ x: Number(row.x), y: Number(row.stature) * statureFactor }))
    .filter((row: { x: number; y: number }) => Number.isFinite(row.x) && Number.isFinite(row.y));
  const lineData = lineRows
    .map((row: Record<string, any>) => ({ x: Number(row.x), fit: Number(row.fit) * statureFactor, lower: Number(row.lower) * statureFactor, upper: Number(row.upper) * statureFactor }))
    .filter((row: { x: number; fit: number; lower: number; upper: number }) => Number.isFinite(row.x) && Number.isFinite(row.fit));
  const caseData = { x: Number(casePoint.x), y: Number(casePoint.stature) * statureFactor, lower: Number(casePoint.lower) * statureFactor, upper: Number(casePoint.upper) * statureFactor };
  if (!pointData.length || !lineData.length || !Number.isFinite(caseData.x) || !Number.isFinite(caseData.y)) return '';
  const xs = [...pointData.map((point) => point.x), ...lineData.map((point) => point.x), caseData.x];
  const ys = [...pointData.map((point) => point.y), ...lineData.map((point) => point.lower), ...lineData.map((point) => point.upper), caseData.y];
  const minX = Math.min(...xs); const maxX = Math.max(...xs);
  const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const padX = Math.max((maxX - minX) * 0.08, 1);
  const padY = Math.max((maxY - minY) * 0.12, 1);
  const lowX = Math.floor(minX - padX); const highX = Math.ceil(maxX + padX);
  const lowY = Math.floor(minY - padY); const highY = Math.ceil(maxY + padY);
  const scaleX = (x: number) => 62 + ((x - lowX) / Math.max(highX - lowX, 0.001)) * 596;
  const scaleY = (y: number) => 386 - ((y - lowY) / Math.max(highY - lowY, 0.001)) * 314;
  const pathFor = (rows: Array<Record<string, number>>, key: 'fit' | 'lower' | 'upper') => rows.map((row, index) => `${index === 0 ? 'M' : 'L'} ${scaleX(row.x).toFixed(2)} ${scaleY(row[key]).toFixed(2)}`).join(' ');
  const piPercent = graph.level ? `${Math.round(Number(graph.level) * 100)}% PI` : 'PI';
  const units = statureUnitLongLabel(statureUnits);
  const footer = Number.isFinite(caseData.lower) && Number.isFinite(caseData.upper) ? `Predicted stature = ${caseData.lower.toFixed(1)} to ${caseData.upper.toFixed(1)} ${statureUnitAbbreviation(statureUnits)} (${piPercent})` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 470" role="img" aria-label="Selected equation stature graph">
    <rect width="720" height="470" fill="#ffffff"/>
    <text x="360" y="26" text-anchor="middle" font-size="16" font-weight="700" fill="#172b3d">Predicted Forensic Stature (${escapeHtml(units)})</text>
    <text x="360" y="46" text-anchor="middle" font-size="11" fill="#334155">${escapeHtml(graph.measurement ?? 'Selected equation')} with ${escapeHtml(piPercent)}; n = ${escapeHtml(graph.n ?? '—')}</text>
    <line x1="62" x2="658" y1="386" y2="386" stroke="#b8c5cf"/>
    <line x1="62" x2="62" y1="72" y2="386" stroke="#b8c5cf"/>
    ${[lowX, Math.round((lowX + highX) / 2), highX].map((tick) => `<g><line x1="${scaleX(tick).toFixed(2)}" x2="${scaleX(tick).toFixed(2)}" y1="72" y2="386" stroke="#dce5ed" stroke-dasharray="4 6"/><text x="${scaleX(tick).toFixed(2)}" y="406" text-anchor="middle" font-size="10" fill="#334155">${tick}</text></g>`).join('')}
    ${[lowY, Math.round((lowY + highY) / 2), highY].map((tick) => `<g><line x1="62" x2="658" y1="${scaleY(tick).toFixed(2)}" y2="${scaleY(tick).toFixed(2)}" stroke="#dce5ed" stroke-dasharray="4 6"/><text x="50" y="${(scaleY(tick)+4).toFixed(2)}" text-anchor="end" font-size="10" fill="#334155">${tick}</text></g>`).join('')}
    <path d="${pathFor(lineData, 'upper')}" fill="none" stroke="#d62828" stroke-width="2" stroke-dasharray="4 7"/>
    <path d="${pathFor(lineData, 'lower')}" fill="none" stroke="#d62828" stroke-width="2" stroke-dasharray="4 7"/>
    <path d="${pathFor(lineData, 'fit')}" fill="none" stroke="#222222" stroke-width="2"/>
    ${pointData.map((point) => `<circle cx="${scaleX(point.x).toFixed(2)}" cy="${scaleY(point.y).toFixed(2)}" r="2.2" fill="#1d4ed8" opacity="0.7"/>`).join('')}
    <polygon points="${scaleX(caseData.x).toFixed(2)},${(scaleY(caseData.y)-9).toFixed(2)} ${(scaleX(caseData.x)-8).toFixed(2)},${(scaleY(caseData.y)+7).toFixed(2)} ${(scaleX(caseData.x)+8).toFixed(2)},${(scaleY(caseData.y)+7).toFixed(2)}" fill="#111111" stroke="#f59e0b" stroke-width="3"/>
    <text x="360" y="430" text-anchor="middle" font-size="11" font-weight="700" fill="#172b3d">${escapeHtml(graph.x_label ?? graph.measurement ?? 'Measurement')}</text>
    <text x="18" y="230" transform="rotate(-90 18 230)" text-anchor="middle" font-size="11" font-weight="700" fill="#172b3d">Stature (${escapeHtml(statureUnitAbbreviation(statureUnits))})</text>
    ${footer ? `<text x="360" y="454" text-anchor="middle" font-size="10" fill="#334155">${escapeHtml(footer)}</text>` : ''}
  </svg>`;
}

function buildReportStatureIntervalSvg(result: AnalyzeResponse, statureUnits: StatureUnits = 'in') {
  const statureFactor = statureUnits === 'cm' ? INCH_TO_CM : 1;
  const rows = Array.isArray(result.result?.top_results) ? result.result.top_results.slice(0, 12) : [];
  if (!rows.length) return '';
  const values = rows.flatMap((row: Record<string, any>) => [Number(row.L) * statureFactor, Number(row.U) * statureFactor, Number(row.Point_Est) * statureFactor]).filter((value) => Number.isFinite(value));
  if (!values.length) return '';
  const minX = Math.min(...values) - 0.5;
  const maxX = Math.max(...values) + 0.5;
  const chart = { left: 72, top: 40, width: 500, rowHeight: 24 };
  const height = chart.top + rows.length * chart.rowHeight + 56;
  const scaleX = (x: number) => scaleLinear(x, minX, maxX, chart.left, chart.left + chart.width);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 660 ${height}" role="img" aria-label="Stature interval plot">
    <rect width="660" height="${height}" fill="#ffffff"/>
    <text x="330" y="24" text-anchor="middle" font-size="16" font-weight="700" fill="#172b3d">Top Stature Estimates</text>
    ${rows.map((row: Record<string, any>, index: number) => {
      const y = chart.top + index * chart.rowHeight + 12;
      const l = Number(row.L) * statureFactor; const u = Number(row.U) * statureFactor; const p = Number(row.Point_Est) * statureFactor;
      const label = String(row.Measurement ?? '').slice(0, 34);
      if (![l,u,p].every(Number.isFinite)) return '';
      return `<g><text x="${chart.left - 8}" y="${y + 4}" text-anchor="end" font-size="10" fill="#334155">${escapeHtml(label)}</text><line x1="${scaleX(l).toFixed(2)}" x2="${scaleX(u).toFixed(2)}" y1="${y}" y2="${y}" stroke="#334155" stroke-width="2"/><circle cx="${scaleX(p).toFixed(2)}" cy="${y}" r="4" fill="#111"/><text x="${(scaleX(u)+6).toFixed(2)}" y="${y+4}" font-size="10" fill="#334155">${formatNumber(p)}</text></g>`;
    }).join('')}
    <line x1="${chart.left}" x2="${chart.left + chart.width}" y1="${height - 30}" y2="${height - 30}" stroke="#222"/>
    <text x="${chart.left}" y="${height - 12}" font-size="10" fill="#334155">${minX.toFixed(1)} ${statureUnitAbbreviation(statureUnits)}</text>
    <text x="${chart.left + chart.width}" y="${height - 12}" text-anchor="end" font-size="10" fill="#334155">${maxX.toFixed(1)} ${statureUnitAbbreviation(statureUnits)}</text>
  </svg>`;
}

function caseReportDisplaySettings(analysis: CaseReportAnalysis, options: ReportOptions): RunLogDisplaySettings {
  const display = analysis.displaySettings ?? {};
  return {
    sortGroupsMode: display.sortGroupsMode === 'group_name' ? 'group_name' : display.sortGroupsMode === 'distance' ? 'distance' : options.sortGroupsMode,
    classificationMatrixMode: display.classificationMatrixMode === 'percentages' ? 'percentages' : display.classificationMatrixMode === 'counts' ? 'counts' : options.classificationMatrixMode,
    typicalityDisplay: {
      f: display.typicalityDisplay?.f !== false,
      chi: display.typicalityDisplay?.chi !== false,
      ranked: display.typicalityDisplay?.ranked !== false
    },
    statureUnits: display.statureUnits === 'cm' ? 'cm' : display.statureUnits === 'in' ? 'in' : options.statureUnits
  };
}

function caseReportCommonSummaryRows(analysis: CaseReportAnalysis) {
  const rows: Array<Record<string, any>> = [];
  if (analysis.runNumber !== null) rows.push({ item: 'Run Log entry', value: `RUN ${analysis.runNumber}` });
  rows.push({ item: 'Completed', value: analysis.timestamp || 'Timestamp unavailable' });
  return rows;
}

function caseReportDfaSummaryRows(analysis: CaseReportAnalysis) {
  const r = analysis.result.result ?? {};
  const rows = caseReportCommonSummaryRows(analysis);
  const variables = Array.isArray(r.variables_used) ? r.variables_used.map(String).filter(Boolean) : [];
  const groups = Array.isArray(r.group_selection?.resolved_groups)
    ? r.group_selection.resolved_groups.map(String).filter(Boolean)
    : Array.isArray(r.groups) ? r.groups.map(String).filter(Boolean) : [];
  const stepwise = r.stepwise ?? {};
  const classification = r.classification ?? {};
  const relationship = Array.isArray(r.relationship) ? r.relationship : [];
  const predictedGroup = classification.predicted_group !== undefined && classification.predicted_group !== null
    ? String(classification.predicted_group)
    : String(relationship[0]?.group ?? '');
  const predictedRow = relationship.find((row: Record<string, any>) => String(row.group ?? '') === predictedGroup) ?? relationship[0];

  if (variables.length) rows.push({ item: 'Measurements used', value: variables.join(', ') });
  if (groups.length) rows.push({ item: 'Reference groups', value: groups.join(', ') });
  rows.push({ item: 'Transformation', value: r.transformation && r.transformation !== 'none' ? String(r.transformation).toUpperCase() : 'None' });
  rows.push({ item: 'Stepwise variable selection', value: stepwise.label ?? (stepwise.active ? 'Stepwise selected' : 'None') });
  if (stepwise.active && Array.isArray(stepwise.selected_variables) && stepwise.selected_variables.length) {
    rows.push({ item: 'Stepwise retained measurements', value: stepwise.selected_variables.join(', ') });
  }

  if (classification.case_classified === false) {
    rows.push({ item: 'Classification mode', value: 'Group classification only' });
  } else {
    if (predictedGroup) rows.push({ item: 'Predicted group', value: predictedGroup });
    if (predictedRow?.d_squared !== undefined) rows.push({ item: 'D²', value: formatNumber(predictedRow.d_squared) });
    if (predictedRow?.posterior_probability !== undefined) rows.push({ item: 'Posterior probability', value: formatProbability(predictedRow.posterior_probability) });
    if (predictedRow?.typicality_f !== undefined) rows.push({ item: 'Typ. F', value: formatProbability(predictedRow.typicality_f) });
    if (predictedRow?.typicality_chi_square !== undefined) rows.push({ item: 'Typ. χ²', value: formatProbability(predictedRow.typicality_chi_square) });
    if (predictedRow?.typicality_ranked !== undefined) {
      const rank = predictedRow.typicality_rank && predictedRow.typicality_rank_denominator
        ? ` (${predictedRow.typicality_rank}/${predictedRow.typicality_rank_denominator})`
        : '';
      rows.push({ item: 'Typ. R', value: `${formatProbability(predictedRow.typicality_ranked)}${rank}` });
    }
  }

  if (classification.total_correct) {
    const percent = Number(classification.total_correct.percent);
    const percentText = Number.isFinite(percent) ? percent.toFixed(1) : '—';
    const rateLabel = classification.rate_estimation?.label ?? classificationRateLabel(r.classification_rate_estimation);
    rows.push({
      item: `${rateLabel} accuracy`,
      value: `${percentText}% (${classification.total_correct.correct ?? '—'}/${classification.total_correct.total ?? '—'})`
    });
  }

  if (Array.isArray(r.measurements_removed) && r.measurements_removed.length) {
    rows.push({ item: 'Measurements removed', value: r.measurements_removed.join(', ') });
  }
  const outliers = r.outliers ?? r.extended_results?.outliers ?? {};
  if (outliers.detected_count !== undefined) rows.push({ item: 'Reference outliers detected', value: outliers.detected_count });
  if (outliers.excluded_count !== undefined && Number(outliers.excluded_count) > 0) rows.push({ item: 'Reference IDs excluded', value: outliers.excluded_count });

  const warnings: string[] = [];
  if (r.classification_safeguard?.triggered) warnings.push(String(r.classification_safeguard.message ?? 'Classification withheld by the Typ. F safeguard.'));
  if (r.case_representation_warning?.message) warnings.push(String(r.case_representation_warning.message));
  const inputWarnings = Array.isArray(r.input_validation?.warnings) ? r.input_validation.warnings : [];
  for (const warning of inputWarnings.slice(0, 2)) {
    const message = warning?.message ?? warning;
    if (message) warnings.push(String(message));
  }
  if (warnings.length) rows.push({ item: 'Important warning', value: warnings.join(' ') });
  return rows;
}

function caseReportStatureSummaryRows(analysis: CaseReportAnalysis, options: ReportOptions) {
  const r = analysis.result.result ?? {};
  const rows = caseReportCommonSummaryRows(analysis);
  const display = caseReportDisplaySettings(analysis, options);
  const units = display.statureUnits;
  const statureOptions = r.stature_options ?? {};
  const best = r.best_estimate ?? (Array.isArray(r.top_results) ? r.top_results[0] : null);
  const variables = Array.isArray(r.variables_used) ? r.variables_used.map(String).filter(Boolean) : [];

  if (variables.length) rows.push({ item: 'Measurements used', value: variables.join(', ') });
  rows.push({ item: 'Stature reference source', value: statureOptions.stature_reference_label ?? '20th C FStats' });
  rows.push({ item: 'Stature group', value: Array.isArray(statureOptions.resolved_groups) && statureOptions.resolved_groups.length ? statureOptions.resolved_groups.join(', ') : 'Any' });
  if (best) {
    rows.push({ item: 'Best-ranked equation', value: best.Measurement ?? best.measurement ?? '—' });
    rows.push({ item: 'Point estimate', value: `${formatStatureCell('Point_Est', best.Point_Est ?? best.point_estimate, units)} ${statureUnitAbbreviation(units)}` });
    rows.push({ item: 'Prediction interval', value: `${formatStatureCell('L', best.L ?? best.lower, units)}–${formatStatureCell('U', best.U ?? best.upper, units)} ${statureUnitAbbreviation(units)}` });
    const rSquared = best['R-Square'] ?? best.R_square ?? best.R_Square ?? best.R2 ?? best.r_squared;
    if (rSquared !== undefined) rows.push({ item: 'Equation R²', value: formatStatureCell('R_square', rSquared, units) });
  }
  rows.push({ item: 'Display units', value: statureUnitLongLabel(units) });
  rows.push({ item: 'Equations evaluated', value: r.stature_result_count ?? r.result_count ?? '—' });
  const warnings = Array.isArray(r.input_validation?.warnings) ? r.input_validation.warnings : [];
  if (warnings.length) {
    rows.push({ item: 'Important warning', value: warnings.slice(0, 2).map((warning: any) => String(warning?.message ?? warning)).join(' ') });
  }
  return rows;
}

function caseReportAnalysisSummaryRows(analysis: CaseReportAnalysis, options: ReportOptions) {
  return analysis.lane === 'stature'
    ? caseReportStatureSummaryRows(analysis, options)
    : caseReportDfaSummaryRows(analysis);
}

function caseReportSummaryTableHtml(analysis: CaseReportAnalysis, options: ReportOptions) {
  const rows = caseReportAnalysisSummaryRows(analysis, options);
  const body = rows.map((row) => `<tr><th scope="row">${escapeHtml(row.item)}</th><td>${escapeHtml(formatCell(row.value))}</td></tr>`).join('');
  return `<article class="case-analysis-summary-entry"><h3>${escapeHtml(analysis.label)}</h3><table class="report-table case-analysis-summary-table"><caption class="sr-only">${escapeHtml(analysis.label)} summary</caption><tbody>${body}</tbody></table></article>`;
}

function buildCaseAnalysisSummaryHtml(analyses: CaseReportAnalysis[], options: ReportOptions) {
  if (!analyses.length) return '';
  return `<section class="case-analysis-summary"><h2>Case Analysis Summary</h2><p class="case-analysis-summary-note">This section contains the latest successful result for each completed analytical lane. Earlier and intermediate runs remain in the Run Log.</p>${analyses.map((analysis) => caseReportSummaryTableHtml(analysis, options)).join('')}</section>`;
}

function buildCaseAnalysisSummaryText(analyses: CaseReportAnalysis[], options: ReportOptions) {
  if (!analyses.length) return '';
  const lines = ['Case Analysis Summary', 'Latest successful result for each completed analytical lane; earlier and intermediate runs remain in the Run Log.'];
  for (const analysis of analyses) {
    lines.push(`\n${analysis.label}`);
    for (const row of caseReportAnalysisSummaryRows(analysis, options)) lines.push(`${row.item}: ${formatCell(row.value)}`);
  }
  return lines.join('\n');
}

function caseReportGraphSnapshots(analysis: CaseReportAnalysis, options: ReportOptions): CaseReportGraphSnapshot[] {
  if (Array.isArray(analysis.graphSnapshots) && analysis.graphSnapshots.length) {
    return analysis.graphSnapshots.map((snapshot) => ({ ...snapshot }));
  }
  const display = caseReportDisplaySettings(analysis, options);
  return buildReportGraphObjects(analysis.result, display.statureUnits);
}

function buildCaseAnalysisGraphsHtml(
  analyses: CaseReportAnalysis[],
  currentResult: AnalyzeResponse | null,
  currentResultHasGraphs: boolean,
  options: ReportOptions
) {
  const laneSections = analyses.map((analysis) => {
    if (currentResultHasGraphs && analysis.result === currentResult) return '';
    const figures = caseReportGraphSnapshots(analysis, options);
    if (!figures.length) return '';
    const runLabel = analysis.runNumber !== null ? `RUN ${analysis.runNumber}` : 'completed analysis';
    return `<article class="case-analysis-graph-lane"><h3>${escapeHtml(analysis.label)}</h3><p class="case-analysis-graph-meta">${escapeHtml(runLabel)} · ${escapeHtml(analysis.timestamp || 'Timestamp unavailable')}</p>${figures.map((figure) => `<figure class="report-graph"><figcaption>${escapeHtml(figure.title)}</figcaption>${figure.content}</figure>`).join('')}</article>`;
  }).filter(Boolean);
  if (!laneSections.length) return '';
  const note = currentResultHasGraphs
    ? 'Graph snapshots for the other completed analytical lanes are shown here. Graphs for the current detailed analysis appear in Detailed Analysis.'
    : 'Graph snapshots are shown for each completed analytical lane retained in this case.';
  return `<section class="case-analysis-graphs"><h2>Case Analysis Graphs</h2><p class="case-analysis-summary-note">${escapeHtml(note)}</p>${laneSections.join('')}</section>`;
}

function buildReportSections(result: AnalyzeResponse, caseId: string, options: ReportOptions) {
  return [
    { title: 'Report Summary', rows: reportSummaryRows(result, caseId, options) },
    { title: 'Analysis Settings', rows: analysisSettingsReportRows(result, options) },
    { title: 'Classification Summary', rows: classificationSummaryRows(result, options) },
    { title: 'Stature Summary', rows: statureSummaryRows(result, options.statureUnits) },
    { title: 'Warnings and Checks', rows: warningReportRows(result) },
    { title: 'Measurement Checks', rows: measurementCheckReportRows(result) },
    { title: options.classificationMatrixMode === 'percentages' ? 'Classification Matrix (%)' : 'Classification Matrix', rows: classificationMatrixReportRows(result, options) },
    { title: 'Multigroup Classification', rows: relationshipReportRows(result, options) },
    { title: 'Top Stature Estimates', rows: topStatureReportRows(result) }
  ];
}

function currentCaseReportDisplaySettings(options: ReportOptions): CaseReportDisplaySettings {
  return {
    sortGroupsMode: options.sortGroupsMode,
    classificationMatrixMode: options.classificationMatrixMode,
    typicalityDisplay: options.typicalityDisplay,
    statureUnits: options.statureUnits
  };
}

function buildCaseReportHtml(currentResult: AnalyzeResponse | null, currentModule: ModuleId, runLogEntries: RunLogEntry[], caseId: string, options: ReportOptions, includePrintControls = false, polishedPdf = false) {
  const analyses = collectLatestCaseReportAnalyses(runLogEntries, currentResult, currentModule, currentCaseReportDisplaySettings(options));
  const summaryHtml = buildCaseAnalysisSummaryHtml(analyses, options);
  const detailSections = currentResult ? buildReportSections(currentResult, caseId, options) : [];
  const detailBody = detailSections.map((section) => htmlTable(section.title, section.rows, options.statureUnits)).join('\n');
  const currentGraphObjects = currentResult ? buildReportGraphObjects(currentResult, options.statureUnits) : [];
  const graphHtml = currentGraphObjects.length
    ? `<section class="report-graphs"><h2>Graph Snapshots</h2>${currentGraphObjects.map((figure) => `<figure class="report-graph"><figcaption>${escapeHtml(figure.title)}</figcaption>${figure.content}</figure>`).join('')}</section>`
    : '';
  const caseGraphsHtml = buildCaseAnalysisGraphsHtml(analyses, currentResult, currentGraphObjects.length > 0, options);
  const detailHtml = currentResult
    ? `<section class="case-report-detail"><h2 class="report-major-heading">Detailed Analysis</h2><p class="case-report-detail-label">${escapeHtml(operationDisplayName(currentResult.operation))}</p>${detailBody || '<p>No detailed tables are available.</p>'}${graphHtml}</section>`
    : '';
  const reportClass = polishedPdf ? 'report-page polished-pdf-page' : 'report-page';
  const html = `<!doctype html>
<html lang="${options.interfaceLanguage === 'es' ? 'es' : 'en'}">
<head>
<meta charset="utf-8" />
<title>FORDISC 4.0 Case Analysis Report</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  .sr-only { position: absolute !important; width: 1px !important; height: 1px !important; padding: 0 !important; margin: -1px !important; overflow: hidden !important; clip: rect(0, 0, 0, 0) !important; white-space: nowrap !important; border: 0 !important; }
  body { font-family: Arial, Helvetica, sans-serif; margin: 0; color: #1f2933; line-height: 1.35; background: #f5f6f8; }
  .report-page { width: min(100%, 8.25in); margin: 24px auto; padding: 0.38in; background: #fff; box-shadow: 0 18px 44px rgba(15, 23, 42, 0.14); }
  .polished-pdf-page { padding: 0.42in 0.46in; }
  .print-controls { width: min(100%, 8.25in); margin: 18px auto 0; text-align: right; }
  .print-controls button { border: 0; border-radius: 10px; background: #4b2e83; color: #fff; font-weight: 700; padding: 10px 14px; cursor: pointer; }
  header { border-bottom: 3px solid #4b2e83; margin-bottom: 18px; padding-bottom: 12px; display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: end; }
  h1 { margin: 0 0 4px 0; font-size: 25px; letter-spacing: 0.04em; }
  h2 { margin: 20px 0 8px 0; font-size: 16px; color: #2b2440; }
  h3 { margin: 14px 0 6px 0; font-size: 14px; color: #2b2440; }
  .report-subtitle { color: #4b2e83; font-size: 12px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; }
  .meta { color: #667085; font-size: 12px; }
  .report-stamp { border: 1px solid #d7cceb; border-radius: 12px; color: #4b2e83; font-weight: 800; padding: 8px 10px; font-size: 11px; text-align: right; white-space: nowrap; }
  .case-analysis-summary { margin-bottom: 24px; }
  .case-analysis-summary-note { margin: 0 0 10px 0; color: #667085; font-size: 11.5px; }
  .case-analysis-summary-entry { border: 1px solid #d7cceb; border-left: 4px solid #4b2e83; border-radius: 8px; margin: 10px 0 14px; padding: 8px 10px 2px; break-inside: avoid; page-break-inside: avoid; }
  .case-analysis-summary-entry h3 { margin-top: 0; }
  .case-analysis-summary-table { margin-bottom: 8px !important; }
  .case-analysis-graphs { margin: 22px 0 26px; }
  .case-analysis-graph-lane { border-top: 2px solid #d7cceb; margin-top: 18px; padding-top: 4px; break-inside: auto; page-break-inside: auto; }
  .case-analysis-graph-lane h3 { margin-bottom: 2px; }
  .case-analysis-graph-meta { margin: 0 0 8px; color: #667085; font-size: 11px; }
  .case-analysis-summary-table th { width: 34%; background: #f7f5fb; }
  .case-analysis-summary-table td { overflow-wrap: anywhere; }
  .case-report-detail { border-top: 3px solid #4b2e83; margin-top: 28px; padding-top: 2px; }
  .report-major-heading { font-size: 18px; }
  .case-report-detail-label { color: #4b2e83; font-size: 12px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; margin-top: -4px; }
  .report-section { break-inside: avoid; page-break-inside: avoid; }
  .report-table { border-collapse: collapse; width: 100%; margin: 8px 0 16px 0; font-size: 11.2px; }
  .report-table th, .report-table td { border: 1px solid #d0d5dd; padding: 5px 7px; text-align: left; vertical-align: top; }
  .measurement-check-report-table th:not(:first-child), .measurement-check-report-table td:not(:first-child) { text-align: right; }
  .measurement-deviation-high .measurement-deviation-value { color: #174ea6; font-weight: 900; }
  .measurement-deviation-low .measurement-deviation-value { color: #b42318; font-weight: 900; }
  .reference-outlier-row td { background: #fff6cf !important; }
  .typicality-caution { font-weight: 900; }
  .typicality-critical { color: #b42318; font-weight: 900; }
  .fd3-classification-matrix-report-table th:nth-child(2), .fd3-classification-matrix-report-table td:nth-child(2),
  .fd3-classification-matrix-report-table th:nth-child(n+3):not(:last-child), .fd3-classification-matrix-report-table td:nth-child(n+3):not(:last-child) { text-align: center; }
  .fd3-classification-matrix-report-table tfoot td, .fd3-classification-matrix-report-table tfoot td.fd3-matrix-total-correct-line { text-align: center !important; font-weight: 800; border-top: 2px solid #111827; }
  .fd3-classification-matrix-report-table .fd3-matrix-into-group-header { text-align: center !important; }
  .fd3-relationship-report-table th, .fd3-relationship-report-table td { text-align: center; white-space: nowrap; }
  .fd3-relationship-report-table th:first-child, .fd3-relationship-report-table td:first-child { text-align: right; }
  .fd3-relationship-report-table .relationship-probability-header, .fd3-relationship-report-table .relationship-probability-cell { text-align: center !important; font-variant-numeric: tabular-nums; }
  .fd3-relationship-report-table .relationship-classified-cell { font-weight: 800; }
  .report-table td.typicality-caution { font-weight: 900; }
  .report-table td.typicality-critical { color: #b42318; font-weight: 900; }
  section.report-graphs { margin-top: 28px; page-break-before: auto; }
  section.report-graphs h2 { margin-bottom: 8px; }
  figure.report-graph { width: 620px; max-width: 100%; margin: 12px auto 20px auto; padding: 10px; border: 1px solid #d0d5dd; background: #fff; break-inside: avoid; page-break-inside: avoid; }
  figure.report-graph figcaption { font-weight: bold; margin-bottom: 6px; color: #2b2440; font-size: 12px; }
  figure.report-graph svg { width: 100%; max-height: 360px; height: auto; display: block; }
  th { background: #f2f0f7; color: #2b2440; }
  tr:nth-child(even) td { background: #fafafa; }
  footer { margin-top: 28px; border-top: 1px solid #d0d5dd; padding-top: 10px; color: #667085; font-size: 10.5px; }
  @page { size: letter; margin: 13mm 14mm; @bottom-right { content: "Page " counter(page) " of " counter(pages); font-family: Arial, Helvetica, sans-serif; font-size: 9px; color: #667085; } }
  @media print {
    body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .print-controls { display: none; }
    .report-page { width: auto; margin: 0; padding: 0; box-shadow: none; }
    header { margin-bottom: 14px; }
    h2, h3 { break-after: avoid; page-break-after: avoid; }
    .report-section { margin-bottom: 2px; }
    .report-table { font-size: 10.2px; margin-bottom: 12px; }
    .report-table th, .report-table td { padding: 4px 5px; }
    .case-report-detail { break-before: page; page-break-before: always; }
    table, figure { break-inside: avoid; page-break-inside: avoid; }
    figure.report-graph svg { max-height: 4.2in; }
  }
</style>
</head>
<body>
${includePrintControls ? '<div class="print-controls"><button onclick="window.print()">Download Case Report</button></div>' : ''}
<main class="${reportClass}">
<header>
  <div>
    <div class="report-subtitle">Case analysis report</div>
    <h1>FORDISC 4.0 Case Analysis Report</h1>
    <div class="meta">Case ID: ${escapeHtml(caseId.trim() || '—')} · Analyst: ${escapeHtml(options.analystName.trim() || '—')} · ${analyses.length} completed ${analyses.length === 1 ? 'analysis' : 'analyses'} · Generated on ${escapeHtml(new Date().toLocaleString())}</div>
  </div>
  <div class="report-stamp">FORDISC 4.0<br/>CASE REPORT</div>
</header>
${summaryHtml || '<p>No completed analyses are available for this case.</p>'}${caseGraphsHtml}${detailHtml}
<footer>Generated from FORDISC 4.0. The Case Analysis Summary reports the latest successful result from each completed analytical lane; consult the Run Log for the complete chronological record.</footer>
</main>
</body>
</html>`;
  return localizeHtmlDocument(html, options.interfaceLanguage);
}

function buildCaseReportText(currentResult: AnalyzeResponse | null, currentModule: ModuleId, runLogEntries: RunLogEntry[], caseId: string, options: ReportOptions) {
  const analyses = collectLatestCaseReportAnalyses(runLogEntries, currentResult, currentModule, currentCaseReportDisplaySettings(options));
  const sections = currentResult ? buildReportSections(currentResult, caseId, options) : [];
  const text = [
    'FORDISC 4.0 Case Analysis Report',
    `Case ID: ${caseId.trim() || '—'}`,
    `Analyst: ${options.analystName.trim() || '—'}`,
    `Generated: ${new Date().toLocaleString()}`,
    buildCaseAnalysisSummaryText(analyses, options),
    ...(currentResult ? [`\nDetailed Analysis: ${operationDisplayName(currentResult.operation)}`] : []),
    ...sections.map((section) => textTable(section.title, section.rows, options.statureUnits)).filter(Boolean)
  ].filter(Boolean).join('\n');
  return translateText(text, options.interfaceLanguage);
}

function downloadCaseReportHtml(currentResult: AnalyzeResponse | null, currentModule: ModuleId, runLogEntries: RunLogEntry[], caseId: string, baseName: string, options: ReportOptions) {
  const blob = new Blob([buildCaseReportHtml(currentResult, currentModule, runLogEntries, caseId, options)], { type: 'text/html;charset=utf-8' });
  triggerDownload(blob, `${baseName}_case_report.html`);
}

function printCaseReportHtml(currentResult: AnalyzeResponse | null, currentModule: ModuleId, runLogEntries: RunLogEntry[], caseId: string, options: ReportOptions) {
  const html = buildCaseReportHtml(currentResult, currentModule, runLogEntries, caseId, options, true, true);
  const reportWindow = window.open('', '_blank');
  if (!reportWindow) return;
  reportWindow.document.open();
  reportWindow.document.write(html);
  reportWindow.document.close();
  reportWindow.focus();
  setTimeout(() => reportWindow.print(), 350);
}

function downloadCaseReportText(currentResult: AnalyzeResponse | null, currentModule: ModuleId, runLogEntries: RunLogEntry[], caseId: string, baseName: string, options: ReportOptions) {
  const blob = new Blob([buildCaseReportText(currentResult, currentModule, runLogEntries, caseId, options)], { type: 'text/plain;charset=utf-8' });
  triggerDownload(blob, `${baseName}_case_report.txt`);
}

function downloadCaseReportPackage(currentResult: AnalyzeResponse | null, currentModule: ModuleId, runLogEntries: RunLogEntry[], caseId: string, baseName: string, options: ReportOptions) {
  const files = [
    { name: `${baseName}_case_report.html`, content: buildCaseReportHtml(currentResult, currentModule, runLogEntries, caseId, options) },
    { name: `${baseName}_pdf_ready_case_report.html`, content: buildCaseReportHtml(currentResult, currentModule, runLogEntries, caseId, options, false, true) },
    { name: `${baseName}_case_report.txt`, content: buildCaseReportText(currentResult, currentModule, runLogEntries, caseId, options) },
    ...(currentResult ? buildReportGraphFiles(currentResult, baseName, options.statureUnits) : []),
    ...(currentResult ? buildExtendedResultFiles(currentResult, baseName) : [])
  ];
  triggerDownload(createStoredZip(files), `${baseName}_case_report_package.zip`);
}

function escapeHtml(value: any) {
  return String(value ?? '—')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function downloadExtendedResultsPackage(result: AnalyzeResponse | null, baseName: string) {
  const files = buildExtendedResultFiles(result, baseName);
  if (!files.length) return;
  const blob = createStoredZip(files);
  triggerDownload(blob, `${baseName}_extended_results_csv_package.zip`);
}

function rowsToCsv(rows: Array<Record<string, any>>) {
  if (!rows.length) return '';
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const csvRows = [
    columns.join(','),
    ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(','))
  ];
  return csvRows.join('\n');
}

function downloadCsv(rows: Array<Record<string, any>>, filename: string) {
  if (!rows.length) return;
  const blob = new Blob([rowsToCsv(rows)], { type: 'text/csv;charset=utf-8' });
  triggerDownload(blob, filename);
}

function downloadSvg(elementId: string, filename: string) {
  const element = document.getElementById(elementId);
  if (!element) return;
  const clone = element.cloneNode(true) as SVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const blob = new Blob([clone.outerHTML], { type: 'image/svg+xml;charset=utf-8' });
  triggerDownload(blob, filename);
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC32_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function setUint16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value & 0xffff, true);
}

function setUint32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value >>> 0, true);
}

function createStoredZip(files: Array<{ name: string; content: string }>) {
  const encoder = new TextEncoder();
  const localParts: BlobPart[] = [];
  const centralParts: BlobPart[] = [];
  let offset = 0;
  for (const file of files) {
    const safeName = file.name.replace(/\\/g, '/');
    const nameBytes = encoder.encode(safeName);
    const dataBytes = encoder.encode(file.content);
    const crc = crc32(dataBytes);
    const local = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(local.buffer);
    setUint32(localView, 0, 0x04034b50);
    setUint16(localView, 4, 20);
    setUint16(localView, 6, 0);
    setUint16(localView, 8, 0);
    setUint16(localView, 10, 0);
    setUint16(localView, 12, 0);
    setUint32(localView, 14, crc);
    setUint32(localView, 18, dataBytes.length);
    setUint32(localView, 22, dataBytes.length);
    setUint16(localView, 26, nameBytes.length);
    setUint16(localView, 28, 0);
    local.set(nameBytes, 30);
    localParts.push(local, dataBytes);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    setUint32(centralView, 0, 0x02014b50);
    setUint16(centralView, 4, 20);
    setUint16(centralView, 6, 20);
    setUint16(centralView, 8, 0);
    setUint16(centralView, 10, 0);
    setUint16(centralView, 12, 0);
    setUint16(centralView, 14, 0);
    setUint32(centralView, 16, crc);
    setUint32(centralView, 20, dataBytes.length);
    setUint32(centralView, 24, dataBytes.length);
    setUint16(centralView, 28, nameBytes.length);
    setUint16(centralView, 30, 0);
    setUint16(centralView, 32, 0);
    setUint16(centralView, 34, 0);
    setUint16(centralView, 36, 0);
    setUint32(centralView, 38, 0);
    setUint32(centralView, 42, offset);
    central.set(nameBytes, 46);
    centralParts.push(central);
    offset += local.length + dataBytes.length;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + (part as Uint8Array).length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  setUint32(endView, 0, 0x06054b50);
  setUint16(endView, 4, 0);
  setUint16(endView, 6, 0);
  setUint16(endView, 8, files.length);
  setUint16(endView, 10, files.length);
  setUint32(endView, 12, centralSize);
  setUint32(endView, 16, offset);
  setUint16(endView, 20, 0);
  return new Blob([...localParts, ...centralParts, end], { type: 'application/zip' });
}

function downloadText(text: string, filename: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  triggerDownload(blob, filename);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value: any) {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function sanitizeFileName(value: string) {
  return (value || 'fordisc4_case').replace(/[^a-z0-9_\-]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'fordisc4_case';
}

function isStatureTableTitle(title: string) {
  return /stature/i.test(title);
}

function normalizeColumnForFormat(column: string) {
  return String(column ?? '').trim().replace(/[\s_%-]+/g, '').toLowerCase();
}

function statureUnitAbbreviation(units: StatureUnits) {
  return units === 'cm' ? 'cm' : 'in';
}

function statureUnitLongLabel(units: StatureUnits) {
  return units === 'cm' ? 'centimeters' : 'inches';
}

function isStatureDisplayColumn(column: string) {
  const key = normalizeColumnForFormat(column);
  return ['pi', 'pointest', 'l', 'u', 'l90', 'u90', 'l95', 'u95', 'l99', 'u99', 'slope', 'intrcpt', 'intercept'].includes(key);
}

function convertStatureDisplayNumber(value: any, units: StatureUnits) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return numeric;
  return units === 'cm' ? numeric * INCH_TO_CM : numeric;
}

function statureAwareTableHeader(title: string, column: string, units: StatureUnits) {
  const label = humanize(column);
  return isStatureTableTitle(title) && isStatureDisplayColumn(column)
    ? `${label} (${statureUnitAbbreviation(units)})`
    : label;
}

function formatStatureCell(column: string, value: any, units: StatureUnits = 'in') {
  if (value === null || value === undefined || value === '') return '—';
  const rawNumeric = Number(value);
  if (!Number.isFinite(rawNumeric)) return formatCell(value);
  const key = normalizeColumnForFormat(column);
  const numeric = isStatureDisplayColumn(column) ? convertStatureDisplayNumber(rawNumeric, units) : rawNumeric;
  if (key === 'n') return String(Math.round(numeric));
  if (key === 'slope') return numeric.toFixed(5);
  if (key === 'intrcpt' || key === 'intercept') return numeric.toFixed(2);
  if (key === 'rsquare' || key === 'rsquared' || key === 'r2') return numeric.toFixed(3);
  if (['pi', 'pointest', 'l', 'u', 'l90', 'u90', 'l95', 'u95', 'l99', 'u99'].includes(key)) return numeric.toFixed(1);
  if (key === 'value') return Math.abs(numeric - Math.round(numeric)) < 1e-9 ? String(Math.round(numeric)) : numeric.toFixed(1);
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(3);
}

function formatTableCell(title: string, column: string, value: any, statureUnits: StatureUnits = 'in') {
  if (isStatureTableTitle(title)) return formatStatureCell(column, value, statureUnits);
  return formatCell(value);
}

function formatOneDecimalCell(value: any) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return numeric.toFixed(1);
}

function formatWholeNumberCell(value: any) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return String(Math.round(numeric));
}

function formatCell(value: any) {
  if (typeof value === 'number') return Number.isInteger(value) ? value : value.toFixed(3);
  if (Array.isArray(value)) return value.join(', ');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return value ?? '—';
}

function titleCase(value: string) {
  return preserveFordiscAcronyms(value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()));
}


function buildVariableLookup(variables: VariableMetadata[]) {
  const lookup = new Map<string, string>();
  for (const variable of variables) {
    lookup.set(normalizeHeader(variable.variable), variable.variable);
    lookup.set(normalizeHeader(variable.display_name ?? ''), variable.variable);
    for (const alias of variable.aliases ?? []) lookup.set(normalizeHeader(alias), variable.variable);
  }
  return lookup;
}

function normalizeHeader(value: string) {
  return String(value ?? '').trim().replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function detectDelimiter(text: string, fileName: string) {
  if (fileName.toLowerCase().endsWith('.tsv')) return '\t';
  const firstLine = text.split(/\r?\n/)[0] ?? '';
  return (firstLine.match(/\t/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? '\t' : ',';
}

function parseDelimitedText(text: string, delimiter: string) {
  // Parse the whole text rather than splitting on newlines first so quoted
  // FD3 COMMENTS / memo text with embedded line breaks remains attached to
  // the original case row.
  const source = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const table: string[][] = [];
  let row: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      row.push(current);
      current = '';
    } else if (char === '\n' && !quoted) {
      row.push(current);
      if (row.some((cell) => cell.trim() !== '')) table.push(row);
      row = [];
      current = '';
    } else {
      current += char;
    }
  }
  if (current !== '' || row.length) {
    row.push(current);
    if (row.some((cell) => cell.trim() !== '')) table.push(row);
  }
  const headers = (table[0] ?? []).map((header) => header.trim());
  const rows = table.slice(1).map((cells) => {
    const parsedRow: Record<string, string> = {};
    headers.forEach((header, index) => { parsedRow[header] = cells[index] ?? ''; });
    return parsedRow;
  });
  return { headers, rows };
}

function parseDelimitedLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

function decodeDbaseText(bytes: Uint8Array) {
  try {
    return new TextDecoder('windows-1252').decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}


function normalizeFd3ImportMeasurementHeader(value: string) {
  const normalized = normalizeHeader(value);
  // FD3/Advantage imported tables may store measurement columns as N__###VAR_
  // (for example N__1GOL_ or N__274PROH). Strip the legacy sequence prefix
  // and trailing padding underscores before matching against FD4 variables.
  const stripped = normalized.replace(/^N+\d+/, '').replace(/_+$/g, '');
  return stripped || normalized;
}

function parseDbaseTable(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 64) throw new Error('The file is too small to be a DBF table.');
  const view = new DataView(buffer);
  const recordCount = view.getUint32(4, true);
  const headerLength = view.getUint16(8, true);
  const recordLength = view.getUint16(10, true);
  if (!recordCount || headerLength < 65 || recordLength < 2 || headerLength >= bytes.length) throw new Error('The DBF header does not contain a readable table structure.');

  const fields: Array<{ name: string; type: string; offset: number; length: number; decimals: number }> = [];
  let offset = 1;
  for (let pos = 32; pos + 32 <= headerLength; pos += 32) {
    if (bytes[pos] === 0x0d) break;
    const nameBytes = bytes.slice(pos, pos + 11);
    const zeroIndex = nameBytes.indexOf(0);
    const rawName = decodeDbaseText(zeroIndex >= 0 ? nameBytes.slice(0, zeroIndex) : nameBytes).trim();
    if (!rawName) continue;
    const type = String.fromCharCode(bytes[pos + 11] || 32).toUpperCase();
    const length = bytes[pos + 16];
    const decimals = bytes[pos + 17];
    if (!length) continue;
    fields.push({ name: rawName, type, offset, length, decimals });
    offset += length;
  }
  if (!fields.length) throw new Error('No DBF fields were detected.');

  const seen = new Map<string, number>();
  const headers = fields.map((field) => {
    const base = field.name.trim() || 'FIELD';
    const count = seen.get(base.toUpperCase()) ?? 0;
    seen.set(base.toUpperCase(), count + 1);
    return count ? `${base}_${count + 1}` : base;
  });

  const rows: Array<Record<string, string>> = [];
  const maxRecords = Math.min(recordCount, Math.floor((bytes.length - headerLength) / recordLength));
  for (let recordIndex = 0; recordIndex < maxRecords; recordIndex += 1) {
    const recordStart = headerLength + recordIndex * recordLength;
    if (recordStart + recordLength > bytes.length) break;
    const deletedFlag = bytes[recordStart];
    if (deletedFlag === 0x2a) continue;
    const row: Record<string, string> = {};
    fields.forEach((field, fieldIndex) => {
      const raw = bytes.slice(recordStart + field.offset, recordStart + field.offset + field.length);
      let value = decodeDbaseText(raw).trim();
      if (field.type === 'D' && /^\d{8}$/.test(value)) value = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
      if (field.type === 'L') value = /^[YyTt]/.test(value) ? 'TRUE' : /^[NnFf]/.test(value) ? 'FALSE' : '';
      row[headers[fieldIndex]] = value;
    });
    rows.push(row);
  }
  if (!rows.length) throw new Error('No active DBF records were found.');
  return { headers, rows };
}


function readUint32LE(bytes: Uint8Array, offset: number) {
  return (((bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8) | ((bytes[offset + 2] ?? 0) << 16) | ((bytes[offset + 3] ?? 0) << 24)) >>> 0);
}

function readUint16BE(bytes: Uint8Array, offset: number) {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function decodeAdtTextValue(bytes: Uint8Array) {
  return decodeDbaseText(bytes).replace(/\0+$/g, '').trim();
}

function formatAdtNumber(value: number) {
  if (!Number.isFinite(value)) return '';
  if (Object.is(value, -0)) return '0';
  const rounded = Math.abs(value) >= 1e-6 ? Number(value.toFixed(10)) : value;
  return String(rounded);
}

function parseAdtNumericValue(raw: Uint8Array, typeCode: number) {
  if (!raw.length) return '';
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  try {
    if (typeCode === 1) {
      const flag = String.fromCharCode(raw[0] ?? 0).toUpperCase();
      if (['T', 'Y', '1'].includes(flag)) return 'TRUE';
      if (['F', 'N', '0'].includes(flag)) return 'FALSE';
      return '';
    }
    if (typeCode === 12 && raw.byteLength >= 2) {
      const value = view.getInt16(0, true);
      return value === -32768 ? '' : String(value);
    }
    if (typeCode === 3 && raw.byteLength >= 4) {
      const value = view.getInt32(0, true);
      return value === -2147483648 ? '' : String(value);
    }
    if (typeCode === 10 && raw.byteLength >= 8) {
      const value = view.getFloat64(0, true);
      return Math.abs(value) > 1e100 ? '' : formatAdtNumber(value);
    }
    if (raw.byteLength >= 8) return formatAdtNumber(view.getFloat64(0, true));
    if (raw.byteLength >= 4) return String(view.getInt32(0, true));
    if (raw.byteLength >= 2) {
      const value = view.getInt16(0, true);
      return value === -32768 ? '' : String(value);
    }
  } catch {
    return '';
  }
  return '';
}


function parseLegacyMemoPointerValue(raw: Uint8Array) {
  if (raw.byteLength < 8) return null as null | { offset: number; length: number };
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const offset = view.getUint32(0, true);
  const length = view.getUint32(4, true);
  if (!offset || !length || length > 1024 * 1024) return null;
  return { offset, length };
}

function encodeLegacyMemoPointer(pointer: { offset: number; length: number }) {
  return `__FD3_MEMO_PTR__:${pointer.offset}:${pointer.length}`;
}

function parseLegacyMemoPointerText(value: any) {
  const match = String(value ?? '').match(/^__FD3_MEMO_PTR__:(\d+):(\d+)$/);
  if (!match) return null as null | { offset: number; length: number };
  return { offset: Number(match[1]), length: Number(match[2]) };
}

function decodeAdtFieldValue(fieldName: string, raw: Uint8Array, typeCode: number) {
  const isCommentField = isLegacyCommentCandidateHeader(fieldName);
  if (isCommentField) {
    const directText = cleanLegacyCommentText(decodeAdtTextValue(raw));
    if (directText) return directText;
    const pointer = parseLegacyMemoPointerValue(raw);
    if (pointer) return encodeLegacyMemoPointer(pointer);
    const numericText = cleanLegacyCommentText(parseAdtNumericValue(raw, typeCode));
    if (numericText) return numericText;
    return '';
  }
  return typeCode === 4 ? decodeAdtTextValue(raw) : parseAdtNumericValue(raw, typeCode);
}

function readAdtFieldOffset(bytes: Uint8Array, meta: number) {
  // Advantage ADT descriptors used by FD3 store offsets with a two-byte base
  // and an additional high byte. This keeps fields beyond byte 255 readable
  // in legacy case files such as FA008-09.
  return readUint16BE(bytes, meta + 2) + ((bytes[meta + 4] ?? 0) * 256);
}

function parseAdvantageTable(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 512) throw new Error('The file is too small to be an Advantage ADT table.');
  const signature = decodeDbaseText(bytes.slice(0, 15)).replace(/\0/g, '').trim();
  if (signature !== 'Advantage Table') throw new Error('The ADT header was not recognized as an Advantage table.');

  const recordCount = readUint32LE(bytes, 24);
  const headerLength = readUint32LE(bytes, 32);
  const recordLength = readUint32LE(bytes, 36);
  const descriptorStart = 400;
  const descriptorLength = 200;
  if (!recordCount || headerLength <= descriptorStart || recordLength < 2 || headerLength >= bytes.length) {
    throw new Error('The ADT header does not contain a readable table structure.');
  }

  const fields: Array<{ name: string; typeCode: number; offset: number; length: number }> = [];
  const descriptorCount = Math.floor((headerLength - descriptorStart) / descriptorLength);
  for (let index = 0; index < descriptorCount; index += 1) {
    const pos = descriptorStart + index * descriptorLength;
    const name = decodeAdtTextValue(bytes.slice(pos, pos + 64));
    if (!name) continue;
    const meta = pos + 128;
    const typeCode = bytes[meta + 1] ?? 0;
    const offset = readAdtFieldOffset(bytes, meta);
    const rawLength = bytes[meta + 7] ?? 0;
    const altLengthLE = ((bytes[meta + 6] ?? 0) | ((bytes[meta + 7] ?? 0) << 8)) >>> 0;
    const altLengthBE = (((bytes[meta + 6] ?? 0) << 8) | (bytes[meta + 7] ?? 0)) >>> 0;
    const commentLike = isLegacyCommentCandidateHeader(name);
    let length = rawLength;
    if (!length && commentLike) {
      const fallbackLength = [altLengthLE, altLengthBE, 8, 10, 12, 16, 32]
        .find((candidate) => candidate > 0 && candidate < 256 && offset + candidate <= recordLength);
      length = fallbackLength ?? 0;
    }
    if ((!length || offset + length > recordLength) && commentLike && offset < recordLength) {
      length = Math.max(0, Math.min(32, recordLength - offset));
    }
    if (!length || offset + length > recordLength) continue;
    fields.push({ name, typeCode, offset, length });
  }
  if (!fields.length) throw new Error('No ADT fields were detected.');

  const seen = new Map<string, number>();
  const headers = fields.map((field) => {
    const base = field.name.trim() || 'FIELD';
    const count = seen.get(base.toUpperCase()) ?? 0;
    seen.set(base.toUpperCase(), count + 1);
    return count ? `${base}_${count + 1}` : base;
  });

  const rows: Array<Record<string, string>> = [];
  const maxRecords = Math.min(recordCount, Math.floor((bytes.length - headerLength) / recordLength));
  for (let recordIndex = 0; recordIndex < maxRecords; recordIndex += 1) {
    const recordStart = headerLength + recordIndex * recordLength;
    if (recordStart + recordLength > bytes.length) break;
    const row: Record<string, string> = {};
    fields.forEach((field, fieldIndex) => {
      const raw = bytes.slice(recordStart + field.offset, recordStart + field.offset + field.length);
      row[headers[fieldIndex]] = decodeAdtFieldValue(field.name, raw, field.typeCode);
    });
    rows.push(row);
  }
  if (!rows.length) throw new Error('No active ADT records were found.');
  return { headers, rows };
}

function buildUnsupportedImportPreview(fileName: string, fileType: string, warnings: string[]): ImportPreview {
  return {
    fileName,
    fileType,
    delimiter: '',
    headers: [],
    rows: [],
    idColumn: null,
    groupColumn: null,
    groupMode: null,
    matchedMeasurementColumns: [],
    ignoredColumns: [],
    warnings,
    unsupported: true
  };
}

function findPreferredImportColumn(headers: string[], candidates: string[]) {
  for (const candidate of candidates) {
    const match = headers.find((header) => normalizeHeader(header) === candidate);
    if (match) return match;
  }
  return null;
}

function importVariableMissingnessImpactRows(preview: ImportPreview) {
  const variables = Array.from(new Set(preview.matchedMeasurementColumns.map((match) => match.variable)));
  if (variables.length < 2 || preview.rows.length < 2) return [] as Array<{ variable: string; missingCells: number; usableGroupsIfOmitted: number; groupsGained: number }>;
  const headerByVariable = new Map<string, string>();
  for (const match of preview.matchedMeasurementColumns) if (!headerByVariable.has(match.variable)) headerByVariable.set(match.variable, match.header);
  const usableGroupsFor = (candidateVariables: string[]) => {
    const counts = new Map<string, number>();
    for (const row of preview.rows) {
      const group = deriveImportGroupValue(row, preview);
      if (!group) continue;
      const complete = candidateVariables.every((variable) => {
        const header = headerByVariable.get(variable);
        return header ? isImportNumericValue(row[header]) : false;
      });
      if (complete) counts.set(group, (counts.get(group) ?? 0) + 1);
    }
    return Array.from(counts.values()).filter((count) => count >= 2).length;
  };
  const baseline = usableGroupsFor(variables);
  return variables.map((variable) => {
    const header = headerByVariable.get(variable);
    const missingCells = header ? preview.rows.filter((row) => !isImportNumericValue(row[header])).length : preview.rows.length;
    const reducedVariables = variables.filter((candidate) => candidate !== variable);
    const usableGroupsIfOmitted = reducedVariables.length >= 2 ? usableGroupsFor(reducedVariables) : baseline;
    return { variable, missingCells, usableGroupsIfOmitted, groupsGained: Math.max(0, usableGroupsIfOmitted - baseline) };
  })
    .filter((row) => row.groupsGained > 0 || row.missingCells > 0)
    .sort((a, b) => b.groupsGained - a.groupsGained || b.missingCells - a.missingCells || a.variable.localeCompare(b.variable));
}

function isImportNumericValue(value: any) {
  const text = String(value ?? '').trim();
  if (text === '') return false;
  return Number.isFinite(Number(text));
}

function buildCustomReferenceRunState(preview: ImportPreview | null, activeIncludedVariables: Set<string>) {
  if (!preview || preview.unsupported || preview.rows.length < 3) return { ready: false, groups: [] as string[], variables: [] as string[] };
  const matchedVariables = Array.from(new Set(preview.matchedMeasurementColumns.map((match) => match.variable)));
  const variables = matchedVariables.filter((variable) => activeIncludedVariables.has(variable));
  const groups = Array.from(new Set(preview.rows.map((row) => deriveImportGroupValue(row, preview)).filter(Boolean))).sort();
  return { ready: Boolean(groups.length >= 2 && variables.length >= 2), groups, variables };
}


function cleanImportTextValue(value: any) {
  const text = String(value ?? '').trim();
  const unquoted = text.replace(/^"(.*)"$/s, '$1').trim();
  return unquoted;
}

function buildCustomReferenceRows(preview: ImportPreview) {
  const idColumn = preview.idColumn;
  return preview.rows.map((row, index) => {
    const out: Record<string, string> = {
      ID: idColumn ? cleanImportTextValue(row[idColumn] ?? `row_${index + 1}`) : `row_${index + 1}`,
      Pop: deriveImportGroupValue(row, preview)
    };
    for (const match of preview.matchedMeasurementColumns) out[match.variable] = String(row[match.header] ?? '').trim();
    return out;
  }).filter((row) => row.Pop);
}

function importGroupDiagnosticRows(preview: ImportPreview) {
  const counts = new Map<string, number>();
  for (const row of preview.rows) {
    const group = deriveImportGroupValue(row, preview);
    if (!group) continue;
    counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([group, count]) => ({ group, count }))
    .sort((a, b) => b.count - a.count || a.group.localeCompare(b.group));
}

function deriveImportGroupValue(row: Record<string, string>, preview: ImportPreview) {
  const mode = preview.groupMode || (preview.groupColumn ? `column:${preview.groupColumn}` : '');
  if (mode === 'derived:Pop+Sex' || mode === 'derived:NPop+NSex' || mode === 'derived:Race+Sex' || mode === 'derived:NRace+NSex') {
    const popKey = mode === 'derived:NPop+NSex' ? 'NPOP' : mode === 'derived:Race+Sex' ? 'RACE' : mode === 'derived:NRace+NSex' ? 'NRACE' : 'POP';
    const sexKey = mode === 'derived:NPop+NSex' || mode === 'derived:NRace+NSex' ? 'NSEX' : 'SEX';
    const popHeader = findHeaderByNormalized(preview.headers, popKey);
    const sexHeader = findHeaderByNormalized(preview.headers, sexKey);
    const pop = popHeader ? cleanImportTextValue(row[popHeader]) : '';
    const sex = sexHeader ? cleanImportTextValue(row[sexHeader]).toUpperCase().slice(0, 1) : '';
    if (pop && sex) return `${pop}${sex}`.trim();
    return pop;
  }
  if (mode.startsWith('column:')) return cleanImportTextValue(row[mode.slice('column:'.length)]);
  return preview.groupColumn ? cleanImportTextValue(row[preview.groupColumn]) : '';
}

function findHeaderByNormalized(headers: string[], normalized: string) {
  return headers.find((header) => normalizeHeader(header) === normalized) ?? null;
}

function detectInitialGroupMode(headers: string[], fallbackGroupColumn: string | null) {
  const popSex = findHeaderByNormalized(headers, 'POPSEX') ?? findHeaderByNormalized(headers, 'NPOPSEX');
  if (popSex) return `column:${popSex}`;
  if (findHeaderByNormalized(headers, 'POP') && findHeaderByNormalized(headers, 'SEX')) return 'derived:Pop+Sex';
  if (findHeaderByNormalized(headers, 'NPOP') && findHeaderByNormalized(headers, 'NSEX')) return 'derived:NPop+NSex';
  if (findHeaderByNormalized(headers, 'RACE') && findHeaderByNormalized(headers, 'SEX')) return 'derived:Race+Sex';
  if (findHeaderByNormalized(headers, 'NRACE') && findHeaderByNormalized(headers, 'NSEX')) return 'derived:NRace+NSex';
  return fallbackGroupColumn ? `column:${fallbackGroupColumn}` : null;
}

function getImportGroupFieldOptions(preview: ImportPreview) {
  const options: Array<{ value: string; label: string }> = [];
  const popSex = findHeaderByNormalized(preview.headers, 'POPSEX') ?? findHeaderByNormalized(preview.headers, 'NPOPSEX');
  if (popSex) options.push({ value: `column:${popSex}`, label: popSex });
  if (findHeaderByNormalized(preview.headers, 'POP') && findHeaderByNormalized(preview.headers, 'SEX')) options.push({ value: 'derived:Pop+Sex', label: 'Derived from Pop + Sex' });
  if (findHeaderByNormalized(preview.headers, 'NPOP') && findHeaderByNormalized(preview.headers, 'NSEX')) options.push({ value: 'derived:NPop+NSex', label: 'Derived from N_POP + N_SEX' });
  if (findHeaderByNormalized(preview.headers, 'RACE') && findHeaderByNormalized(preview.headers, 'SEX')) options.push({ value: 'derived:Race+Sex', label: 'Derived from Race + Sex' });
  if (findHeaderByNormalized(preview.headers, 'NRACE') && findHeaderByNormalized(preview.headers, 'NSEX')) options.push({ value: 'derived:NRace+NSex', label: 'Derived from N_RACE + N_SEX' });
  const matchedHeaders = new Set(preview.matchedMeasurementColumns.map((match) => normalizeHeader(match.header)));
  const idNorm = normalizeHeader(preview.idColumn ?? '');
  for (const header of preview.headers) {
    const norm = normalizeHeader(header);
    if (!norm || matchedHeaders.has(norm) || norm === idNorm) continue;
    const value = `column:${header}`;
    if (!options.some((option) => option.value === value)) options.push({ value, label: header });
  }
  return options;
}

function describeImportGroupMode(preview: ImportPreview) {
  const mode = preview.groupMode || (preview.groupColumn ? `column:${preview.groupColumn}` : '');
  if (mode === 'derived:Pop+Sex') return 'Derived from Pop + Sex';
  if (mode === 'derived:NPop+NSex') return 'Derived from N_POP + N_SEX';
  if (mode === 'derived:Race+Sex') return 'Derived from Race + Sex';
  if (mode === 'derived:NRace+NSex') return 'Derived from N_RACE + N_SEX';
  if (mode.startsWith('column:')) return mode.slice('column:'.length) || 'Missing';
  return preview.groupColumn ?? 'Missing';
}

function updateImportGroupMode(preview: ImportPreview, mode: string): ImportPreview {
  const groupColumn = mode.startsWith('column:') ? mode.slice('column:'.length) : preview.groupColumn;
  const ignoredColumns = computeIgnoredColumns(preview.headers, preview.matchedMeasurementColumns, preview.idColumn, mode);
  const warnings = buildImportWarnings(preview.idColumn, groupColumn, preview.matchedMeasurementColumns, ignoredColumns);
  return { ...preview, groupMode: mode, groupColumn, ignoredColumns, warnings };
}

function computeIgnoredColumns(headers: string[], matchedMeasurementColumns: Array<{ header: string; variable: string }>, idColumn: string | null, groupMode: string | null) {
  const matched = new Set(matchedMeasurementColumns.map((match) => normalizeHeader(match.header)));
  const protectedColumns = new Set<string>();
  if (idColumn) protectedColumns.add(normalizeHeader(idColumn));
  if (groupMode === 'derived:Pop+Sex') {
    protectedColumns.add('POP');
    protectedColumns.add('SEX');
  } else if (groupMode === 'derived:NPop+NSex') {
    protectedColumns.add('NPOP');
    protectedColumns.add('NSEX');
  } else if (groupMode === 'derived:Race+Sex') {
    protectedColumns.add('RACE');
    protectedColumns.add('SEX');
  } else if (groupMode === 'derived:NRace+NSex') {
    protectedColumns.add('NRACE');
    protectedColumns.add('NSEX');
  } else if (groupMode?.startsWith('column:')) {
    protectedColumns.add(normalizeHeader(groupMode.slice('column:'.length)));
  }
  return headers.filter((header) => {
    const normalized = normalizeHeader(header);
    return !matched.has(normalized) && !protectedColumns.has(normalized);
  });
}

function buildImportWarnings(idColumn: string | null, groupColumn: string | null, matchedMeasurementColumns: Array<{ header: string; variable: string }>, ignoredColumns: string[]) {
  const warnings: string[] = [];
  if (!idColumn) warnings.push('No ID column was auto-detected. Common names include ID, Item, Catkey, Specimen, CaseID, and ContNum.');
  if (!groupColumn) warnings.push('No grouping column was auto-detected. Common names include PopSex, Pop, Group, Population, Class, and Classification.');
  if (!matchedMeasurementColumns.length) warnings.push('No active-module Fordisc measurement columns were matched. Check column names or switch modules before importing.');
  if (ignoredColumns.length) warnings.push(`${ignoredColumns.length} nonmatching column(s) will be ignored. Review the matched/ignored column summary below.`);
  return warnings;
}

function buildImportPreview(fileName: string, ext: string, delimiter: string, headers: string[], rows: Array<Record<string, string>>, variableLookup: Map<string, string>, extraWarnings: string[] = []): ImportPreview {
  const idCandidates = ['ID', 'CATINDRPT', 'N_CATINDRPT', 'CASEID', 'CASE', 'SPECIMEN', 'SPECIMENID', 'INDIVIDUALID', 'INDIVID', 'CONTNUM', 'ITEM', 'CATKEY', 'N_CATKEY'];
  const groupCandidates = ['POPSEX', 'N_POPSEX', 'POP', 'N_POP', 'GROUP', 'GROUPID', 'POPULATION', 'REFERENCEGROUP', 'REFERENCEGRP', 'CLASS', 'CLASSIFICATION', 'CATKEY', 'N_CATKEY', 'RACE', 'N_RACE', 'SEX', 'N_SEX'];
  const idColumn = findPreferredImportColumn(headers, idCandidates);
  const detectedGroupColumn = findPreferredImportColumn(headers, groupCandidates);
  const groupMode = detectInitialGroupMode(headers, detectedGroupColumn);
  const groupColumn = groupMode?.startsWith('column:') ? groupMode.slice('column:'.length) : detectedGroupColumn;
  const matchedMeasurementColumns: Array<{ header: string; variable: string }> = [];
  for (const header of headers) {
    const normalized = normalizeHeader(header);
    const variable = variableLookup.get(normalized) ?? variableLookup.get(normalizeFd3ImportMeasurementHeader(header));
    if (variable) matchedMeasurementColumns.push({ header, variable });
  }
  const ignoredColumns = computeIgnoredColumns(headers, matchedMeasurementColumns, idColumn, groupMode);
  const warnings = [...extraWarnings, ...buildImportWarnings(idColumn, groupColumn, matchedMeasurementColumns, ignoredColumns)];
  return { fileName, fileType: ext.toUpperCase() || 'TEXT', delimiter: delimiter === '\t' ? 'tab' : delimiter === 'dbf' ? 'DBF' : delimiter === 'adt' ? 'ADT' : 'comma', headers, rows, idColumn, groupColumn, groupMode, matchedMeasurementColumns, ignoredColumns, warnings, unsupported: false };
}

async function downloadImportTemplate(kind: 'cranial' | 'postcranial') {
  const moduleIds: ModuleId[] = kind === 'cranial' ? ['cranial_fdb_dfa', 'cranial_howells_dfa', 'cranial_international_dfa'] : ['postcranial_stature'];
  const responses = await Promise.all(moduleIds.map((moduleId) => apiGet<{ variables: VariableMetadata[] }>(`/metadata/variables?module=${moduleId}`)));
  const variableMap = new Map<string, VariableMetadata>();
  for (const response of responses) {
    for (const variable of response.variables) {
      if (!variable.calculated && !variableMap.has(variable.variable)) variableMap.set(variable.variable, variable);
    }
  }
  const headers = ['ID', 'PopSex', ...Array.from(variableMap.values()).sort((a, b) => (a.display_order ?? 9999) - (b.display_order ?? 9999)).map((variable) => variable.variable)];
  const csv = `${headers.join(',')}
`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fordisc4_${kind}_custom_reference_template.csv`;
  a.click();
  URL.revokeObjectURL(url);
}


const FD3_FDB_CASE_GROUP_ALIASES: Record<string, string> = {
  AF: 'AF', AM: 'AM', BF: 'BF', BM: 'BM', BF20: 'BF', BM20: 'BM', HF: 'HF', HM: 'HM',
  CHM: 'CHM', GTM: 'GTM', JF: 'JF', JM: 'JM', JF20: 'JF', JM20: 'JM', VM: 'VM', WF: 'WF', WM: 'WM', WF20: 'WF', WM20: 'WM'
};

const FD3_POSTCRANIAL_CASE_GROUP_ALIASES: Record<string, string> = {
  BFPC: 'BF', BMPC: 'BM', WFPC: 'WF', WMPC: 'WM', BF: 'BF', BM: 'BM', HF: 'HF', HM: 'HM', WF: 'WF', WM: 'WM'
};

const FD3_HOWELLS_CASE_GROUP_CODES = new Set([
  'AINF','AINM','ANDF','ANDM','ANYM','ARIF','ARIM','ATAF','ATAM','AUSF','AUSM','BERF','BERM','BURF','BURM','BUSF','BUSM','DOGF','DOGM','EASF','EASM','EGYF','EGYM','ESKF','ESKM','GUAF','GUAM','HAIF','HAIM','MOKF','MOKM','MORF','MORM','NJAF','NJAM','NORF','NORM','PERF','PERM','PHIM','SANF','SANM','SJAF','SJAM','TASF','TASM','TEIF','TEIM','TOLF','TOLM','ZALF','ZALM','ZULF','ZULM','BF19','BM19','WF19','WM19','BF20','BM20','WF20','WM20','GTM','JF20','JM20'
]);

const FD3_CASE_NON_MEASUREMENT_HEADERS = new Set([
  'ITEM','CASENO','POPSEX','COMMENTS','COMMENT','CASECOMMENT','CASECOMMENTS','CASENOTE','CASENOTES','NOTES','NOTE','MEMO','HAZARDFUNC','SEX','RACE',
  'REG_SUB_AGEEST_1','REG_SUB_AGEEST_2','REG_SUB_SEXEST_1'
]);

function isTruthyLegacyFlag(value: string | undefined) {
  const normalized = String(value ?? '').trim().toUpperCase();
  return ['TRUE', 'T', 'Y', 'YES', '1', '-1'].includes(normalized);
}

function isLegacyFd3CaseTable(headers: string[], rows: Array<Record<string, string>>) {
  if (!rows.length || rows.length > 5) return false;
  const normalizedHeaders = new Set(headers.map(normalizeHeader));
  const hasCaseNumber = normalizedHeaders.has('CASENO') || normalizedHeaders.has('CASEID') || normalizedHeaders.has('CASE');
  const legacyGroupFieldCount = headers.filter((header) => FD3_FDB_CASE_GROUP_ALIASES[normalizeHeader(header)] || FD3_POSTCRANIAL_CASE_GROUP_ALIASES[normalizeHeader(header)] || FD3_HOWELLS_CASE_GROUP_CODES.has(normalizeHeader(header))).length;
  return hasCaseNumber && legacyGroupFieldCount >= 4;
}

function cleanLegacyCommentText(value: any) {
  const text = String(value ?? '')
    .replace(/%0D%0A/gi, '\n')
    .replace(/%0A/gi, '\n')
    .replace(/%0D/gi, '\n')
    .replace(/\\par[d]?\s*/gi, '\n')
    .replace(/\\'[0-9a-f]{2}/gi, ' ')
    .replace(/\\[a-z]+-?\d*\s?/gi, ' ')
    .replace(/[{}]/g, ' ')
    .replace(/\0/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim();
  if (!text) return '';
  if (/^__FD3_MEMO_PTR__:/i.test(text)) return '';
  // Some FD3/ADT case files expose a memo pointer or uninitialized binary value
  // through the COMMENTS column. Do not copy those numeric artifacts into notes.
  if (/^[+-]?(?:(?:\d+\.?\d*)|(?:\.\d+))(?:e[+-]?\d+)?$/i.test(text)) return '';
  if (!/[A-Za-z]/.test(text)) return '';
  return text;
}


function isLegacyCommentHeader(header: string) {
  const normalized = normalizeHeader(header);
  return [
    'COMMENTS', 'COMMENT', 'CASECOMMENT', 'CASECOMMENTS', 'CASENOTE', 'CASENOTES',
    'NOTES', 'NOTE', 'MEMO', 'MEMOS', 'MEMO1', 'COMMENTTEXT', 'COMMENTSTEXT'
  ].includes(normalized) || /^COMMENTS?\d*$/.test(normalized) || /^COMMENT(TEXT)?\d*$/.test(normalized) || /^NOTES?\d*$/.test(normalized);
}

function isLegacyCommentCandidateHeader(header: string) {
  const normalized = normalizeHeader(header);
  if (isLegacyCommentHeader(header)) return true;
  return /COMMENT|MEMO|NOTE|TEXT/.test(normalized) || /^PUBTEXT\d*$/.test(normalized) || /^PUBRELTEXT\d*$/.test(normalized);
}

function collectReadableLegacyCommentValues(headers: string[], row: Record<string, string>) {
  const directValues: string[] = [];
  const fallbackValues: Array<{ text: string; score: number }> = [];
  const rawValues: string[] = [];
  const seen = new Set<string>();
  for (const header of headers) {
    if (!isLegacyCommentCandidateHeader(header)) continue;
    const raw = String(row[header] ?? '');
    if (raw.trim()) rawValues.push(raw);
    const cleaned = cleanLegacyCommentText(raw);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const score = legacyCommentCandidateScore(cleaned);
    if (isLegacyCommentHeader(header)) directValues.push(cleaned);
    else if (score > 0) fallbackValues.push({ text: cleaned, score });
  }
  if (directValues.length) return { text: directValues.join('\n\n'), rawValues };
  const selectedFallbacks = fallbackValues
    .sort((a, b) => b.score - a.score || b.text.length - a.text.length)
    .filter((item, index, list) => {
      if (index === 0) return true;
      return item.score >= Math.max(40, list[0]?.score ?? 0);
    })
    .map((item) => item.text);
  return { text: selectedFallbacks.join('\n\n'), rawValues };
}

function collectLegacyMemoPointers(headers: string[], rows: Array<Record<string, string>>) {
  const pointers: Array<{ offset: number; length: number }> = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const header of headers) {
      if (!isLegacyCommentCandidateHeader(header)) continue;
      const pointer = parseLegacyMemoPointerText(row[header]);
      if (!pointer) continue;
      const key = `${pointer.offset}:${pointer.length}`;
      if (!seen.has(key)) {
        seen.add(key);
        pointers.push(pointer);
      }
    }
  }
  return pointers;
}

function decodeLegacyMemoSlice(bytes: Uint8Array) {
  const candidates = [
    decodeDbaseText(bytes),
    (() => {
      const chars: string[] = [];
      for (let i = 0; i + 1 < bytes.length; i += 2) {
        const code = bytes[i] | ((bytes[i + 1] ?? 0) << 8);
        if (code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 0xfffd)) chars.push(String.fromCharCode(code));
        else chars.push(' ');
      }
      return chars.join('');
    })()
  ];
  for (const candidate of candidates) {
    const cleaned = cleanLegacyCommentText(candidate);
    if (legacyCommentCandidateScore(cleaned) > 0) return cleaned;
  }
  return '';
}

function extractLegacyAdmMemoByPointers(buffer: ArrayBuffer, pointers: Array<{ offset: number; length: number }>) {
  const bytes = new Uint8Array(buffer);
  const found: string[] = [];
  const seen = new Set<string>();
  for (const pointer of pointers) {
    const offsets = [pointer.offset, Math.max(0, pointer.offset - 4), Math.max(0, pointer.offset - 8), Math.max(0, pointer.offset - 512)];
    for (const offset of offsets) {
      if (offset >= bytes.length) continue;
      const end = Math.min(bytes.length, offset + pointer.length);
      if (end <= offset) continue;
      const cleaned = decodeLegacyMemoSlice(bytes.slice(offset, end));
      const key = cleaned.toLowerCase();
      if (cleaned && !seen.has(key)) {
        seen.add(key);
        found.push(cleaned);
        break;
      }
    }
  }
  return found.join('\n\n');
}

function extractPrintableMemoSegments(bytes: Uint8Array) {
  const segments: string[] = [];
  let current = '';
  const push = () => {
    const cleaned = cleanLegacyCommentText(current);
    if (legacyCommentCandidateScore(cleaned) > 0) segments.push(cleaned);
    current = '';
  };
  for (const byte of bytes) {
    if (byte === 9 || byte === 10 || byte === 13) current += '\n';
    else if (byte >= 32 && byte <= 126) current += String.fromCharCode(byte);
    else push();
  }
  push();
  return segments;
}

function legacyCommentCandidateScore(text: string) {
  const cleaned = cleanLegacyCommentText(text);
  if (!cleaned || cleaned.length < 3) return 0;
  const letters = (cleaned.match(/[A-Za-z]/g) ?? []).length;
  const printable = (cleaned.match(/[A-Za-z0-9.,;:'"!?()\-\/\n ]/g) ?? []).length;
  const ratio = printable / Math.max(cleaned.length, 1);
  if (letters < 2 || ratio < 0.70) return 0;
  if (/^(Advantage|Table|Memo|Field|Comments?|Binary|Blob|Record|Header)$/i.test(cleaned)) return 0;
  const commentBoost = /comment|note|case|agency|submitted|stature|race|sex|decedent/i.test(cleaned) ? 80 : 0;
  const lineCountBoost = cleaned.includes('\n') ? 20 : 0;
  return cleaned.length + letters + commentBoost + lineCountBoost;
}

function extractLegacyAdmMemoCandidates(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const candidates: string[] = [];
  if (!bytes.length) return candidates;

  candidates.push(...extractPrintableMemoSegments(bytes));

  const decoded8 = decodeDbaseText(bytes)
    .replace(/\0/g, '\n')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ');
  candidates.push(...decoded8.split(/\n+/));

  const utf16Chars: string[] = [];
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const code = bytes[i] | ((bytes[i + 1] ?? 0) << 8);
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 0xfffd)) utf16Chars.push(String.fromCharCode(code));
    else utf16Chars.push('\n');
  }
  const decoded16 = utf16Chars.join('')
    .replace(/\0/g, '\n')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ');
  candidates.push(...decoded16.split(/\n+/));

  return candidates
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= 3 && /[A-Za-z]/.test(line))
    .filter((line) => !/^[A-Z]{1,12}\s*[:=]?\s*\d+(?:\.\d+)?$/i.test(line))
    .filter((line) => !/^Advantage/i.test(line));
}

function extractLegacyAdmMemoText(buffer: ArrayBuffer, fileName = '', pointers: Array<{ offset: number; length: number }> = []) {
  const pointerText = extractLegacyAdmMemoByPointers(buffer, pointers);
  const candidates = extractLegacyAdmMemoCandidates(buffer);
  if (pointerText) candidates.unshift(pointerText);
  if (!candidates.length) return '';
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const line of candidates) {
    const cleaned = cleanLegacyCommentText(line);
    const normalized = cleaned.toLowerCase();
    if (!cleaned || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(cleaned);
  }
  const joined = cleanLegacyCommentText(unique.join('\n'));
  if (!joined) return '';
  const wholeScore = legacyCommentCandidateScore(joined);
  const bestLine = unique
    .map((line) => ({ line, score: legacyCommentCandidateScore(line) }))
    .sort((a, b) => b.score - a.score)[0];
  const restored = wholeScore >= Math.max(bestLine?.score ?? 0, 1) ? joined : (bestLine?.line ?? joined);
  return restored.length > 5000 ? `${restored.slice(0, 5000)}\n[truncated from ${fileName || 'ADM memo'}]` : restored;
}

function buildLegacyFd3CasePreview(fileName: string, ext: string, headers: string[], rows: Array<Record<string, string>>, variables: VariableMetadata[], admSelected: boolean, legacyMemoText = ''): LegacyFd3CasePreview {
  if (!rows.length) throw new Error('No FD3 case row could be read from this file.');
  if (!isLegacyFd3CaseTable(headers, rows)) {
    throw new Error('This file does not look like an FD3 case file. Use Import Data for custom reference datasets.');
  }
  const row = rows[0];

  const variableByNormalized = buildVariableLookup(variables);
  const variableMetadata = new Map(variables.map((variable) => [variable.variable, variable]));
  const measurements: Record<string, string> = {};
  const ignoredFields: string[] = [];
  for (const header of headers) {
    const normalized = normalizeHeader(header);
    const value = String(row[header] ?? '').trim();
    const variable = variableByNormalized.get(normalized) ?? variableByNormalized.get(normalizeFd3ImportMeasurementHeader(header));
    if (variable && value !== '' && isFinite(Number(value))) {
      measurements[variable] = value;
    } else if (value !== '' && !FD3_CASE_NON_MEASUREMENT_HEADERS.has(normalized) && !isLegacyCommentHeader(header) && !FD3_FDB_CASE_GROUP_ALIASES[normalized] && !FD3_POSTCRANIAL_CASE_GROUP_ALIASES[normalized] && !FD3_HOWELLS_CASE_GROUP_CODES.has(normalized)) {
      ignoredFields.push(header);
    }
  }

  const rawSelectedVariables = Object.keys(measurements).sort((a, b) => (variableMetadata.get(a)?.display_order ?? 9999) - (variableMetadata.get(b)?.display_order ?? 9999));
  const rawSelectedGroups = headers.filter((header) => isTruthyLegacyFlag(row[header]) && (FD3_FDB_CASE_GROUP_ALIASES[normalizeHeader(header)] || FD3_POSTCRANIAL_CASE_GROUP_ALIASES[normalizeHeader(header)] || FD3_HOWELLS_CASE_GROUP_CODES.has(normalizeHeader(header)))).map((header) => normalizeHeader(header));

  const fdbGroups = new Set<string>();
  const postcranialGroups = new Set<string>();
  const howellsGroups = new Set<string>();
  const fdbAliases: Array<{ raw: string; mapped: string }> = [];
  const postcranialAliases: Array<{ raw: string; mapped: string }> = [];
  const howellsAliases: Array<{ raw: string; mapped: string }> = [];
  for (const raw of rawSelectedGroups) {
    const fdb = FD3_FDB_CASE_GROUP_ALIASES[raw];
    if (fdb) {
      fdbGroups.add(fdb);
      if (fdb !== raw) fdbAliases.push({ raw, mapped: fdb });
    }
    const pc = FD3_POSTCRANIAL_CASE_GROUP_ALIASES[raw];
    if (pc) {
      postcranialGroups.add(pc);
      if (pc !== raw) postcranialAliases.push({ raw, mapped: pc });
    }
    if (FD3_HOWELLS_CASE_GROUP_CODES.has(raw)) {
      howellsGroups.add(raw);
      howellsAliases.push({ raw, mapped: raw });
    }
  }

  const moduleCounts: Record<ModuleId, number> = {
    cranial_fdb_dfa: 0,
    cranial_howells_dfa: 0,
    cranial_international_dfa: 0,
    postcranial_stature: 0
  };
  for (const variable of rawSelectedVariables) {
    const modules = variableMetadata.get(variable)?.modules ?? [];
    if (modules.includes('postcranial_stature')) moduleCounts.postcranial_stature += 1;
    if (modules.includes('cranial_fdb_dfa')) moduleCounts.cranial_fdb_dfa += 1;
    if (modules.includes('cranial_howells_dfa')) moduleCounts.cranial_howells_dfa += 1;
  }

  let suggestedModule: ModuleId = 'cranial_fdb_dfa';
  if (postcranialGroups.size >= 2 || moduleCounts.postcranial_stature > Math.max(moduleCounts.cranial_fdb_dfa, moduleCounts.cranial_howells_dfa)) suggestedModule = 'postcranial_stature';
  else if (fdbGroups.size >= 2) suggestedModule = 'cranial_fdb_dfa';
  else if (howellsGroups.size >= 2) suggestedModule = 'cranial_howells_dfa';
  else if (moduleCounts.cranial_howells_dfa > moduleCounts.cranial_fdb_dfa) suggestedModule = 'cranial_howells_dfa';

  const selectedVariables = rawSelectedVariables.filter((variable) => {
    const metadata = variableMetadata.get(variable);
    if (!metadata?.modules?.includes(suggestedModule)) return false;
    if (suggestedModule === 'cranial_fdb_dfa' && CRANIAL_FDB_CALCULATED.has(variable)) return false;
    if (suggestedModule === 'cranial_howells_dfa' && CRANIAL_HOWELLS_CALCULATED.has(variable)) return false;
    return true;
  });
  const omittedDefaultCalculated = rawSelectedVariables.filter((variable) => {
    if (suggestedModule === 'cranial_fdb_dfa') return CRANIAL_FDB_CALCULATED.has(variable);
    if (suggestedModule === 'cranial_howells_dfa') return CRANIAL_HOWELLS_CALCULATED.has(variable);
    return false;
  });

  const selectedGroupsByModule: Record<ModuleId, string[]> = {
    cranial_fdb_dfa: Array.from(fdbGroups).sort(),
    cranial_howells_dfa: Array.from(howellsGroups).sort(),
    cranial_international_dfa: [],
    postcranial_stature: Array.from(postcranialGroups).sort()
  };
  const aliasByModule: Record<ModuleId, Array<{ raw: string; mapped: string }>> = {
    cranial_fdb_dfa: dedupeAliases(fdbAliases),
    cranial_howells_dfa: dedupeAliases(howellsAliases.filter((alias) => alias.raw !== alias.mapped)),
    cranial_international_dfa: [],
    postcranial_stature: dedupeAliases(postcranialAliases)
  };

  const caseIdHeader = headers.find((header) => ['CASENO', 'CASEID', 'CASE'].includes(normalizeHeader(header)));
  const caseId = caseIdHeader ? String(row[caseIdHeader] ?? '').trim() : fileName.replace(/\.[^.]+$/i, '');
  const directCommentValues = collectReadableLegacyCommentValues(headers, row);
  const directComments = cleanLegacyCommentText(directCommentValues.text);
  const memoComments = cleanLegacyCommentText(legacyMemoText);
  const commentsRejected = Boolean(directCommentValues.rawValues.some((raw) => raw.trim()) && !directComments);
  let comments = directComments;
  let commentsSource = directComments ? 'FD3 COMMENTS field' : '';
  if (memoComments && directComments && memoComments !== directComments) {
    comments = `${directComments}

${memoComments}`;
    commentsSource = 'FD3 COMMENTS field and ADM memo';
  } else if (memoComments && !directComments) {
    comments = memoComments;
    commentsSource = 'FD3 ADM memo';
  }
  const commentsRestored = Boolean(comments);
  const commentsAvailable = commentsRestored || admSelected || directCommentValues.rawValues.some((raw) => raw.trim());
  const warnings: string[] = [];
  if (rows.length > 1) warnings.push(`This file contains ${rows.length} rows. FD3 case opening uses the first row; use Import Data for reference datasets.`);
  if (!selectedVariables.length) warnings.push('No Fordisc measurements were found. Review the file or use Import Data if this is a reference dataset.');
  if (selectedGroupsByModule[suggestedModule].length < 2) warnings.push('Fewer than two comparison groups were restored for the suggested module. Review the Reference Groups panel before running analysis.');
  if (commentsRestored) warnings.push(`${commentsSource} text will be copied into Case Notes when this case is opened.`);
  else if (commentsRejected) warnings.push('A legacy COMMENTS field was present, but it did not contain readable text and was not copied to Case Notes.');
  else if (ext === 'adt' || admSelected) warnings.push('FD3 case data were restored. Legacy ADT/ADM memo comments are not always recoverable in FORDISC 4.0; export the case from FD3 or Advantage as CSV when comments must be preserved.');
  if (ignoredFields.length) warnings.push(`${ignoredFields.length} legacy FD3 field(s) are not used when opening a case in FORDISC 4.0 and will be ignored.`);

  return {
    fileName,
    fileType: ext.toUpperCase() || 'FD3',
    caseId,
    suggestedModule,
    measurements,
    selectedVariables,
    selectedGroups: selectedGroupsByModule[suggestedModule],
    rawSelectedGroups,
    groupAliases: aliasByModule[suggestedModule],
    ignoredFields,
    warnings,
    rowCount: rows.length,
    comments,
    commentsAvailable,
    commentsRestored,
    commentsSource
  };
}

function dedupeAliases(aliases: Array<{ raw: string; mapped: string }>) {
  const seen = new Set<string>();
  const out: Array<{ raw: string; mapped: string }> = [];
  for (const alias of aliases) {
    const key = `${alias.raw}->${alias.mapped}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(alias);
    }
  }
  return out;
}


function preserveFordiscAcronyms(value: string) {
  return value
    .replace(/\bFd3\b/gi, 'FD3')
    .replace(/\bFd4\b/gi, 'FD4')
    .replace(/\bFdb\b/gi, 'FDB')
    .replace(/\bUtk\b/gi, 'UTK');
}

function humanize(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'utk_groups') return 'UTK';
  if (normalized === 'fd3_popsex' || normalized === 'fdb' || normalized === 'fdb_cranial') return 'FDB';
  if (normalized === 'gs_imp_percent') return 'GS Imp %';
  if (normalized === 'cc_imp_percent') return 'CC Imp %';
  return preserveFordiscAcronyms(value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()));
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const key = keyFn(item);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}
