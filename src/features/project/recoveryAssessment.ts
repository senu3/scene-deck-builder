export type RecoveryAssessmentMode = 'full' | 'repairable' | 'corrupted';

export interface RecoveryNormalizationFlags {
  sceneIdsAssigned: boolean;
  sceneOrderNormalized: boolean;
  sceneStructureNormalized: boolean;
  metadataNormalized: boolean;
}

export interface RecoveryAssessmentReport {
  readableSceneCount: number;
  missingAssetCount: number;
  skippedMetadataCount: number;
  rescuedCutCount: number;
  orphanMetadataCount: number;
  projectSchemaVersion: number;
  metadataSchemaVersion: number;
  normalizationFlags: RecoveryNormalizationFlags;
}

export interface RecoveryAssessmentIssue {
  severity: 'warning' | 'fatal';
  code: string;
  message: string;
}

export interface RecoveryAssessment {
  mode: RecoveryAssessmentMode;
  report: RecoveryAssessmentReport;
  issues: RecoveryAssessmentIssue[];
}

function hasNormalization(flags: RecoveryNormalizationFlags): boolean {
  return Object.values(flags).some(Boolean);
}

export function createRecoveryAssessment(
  report: RecoveryAssessmentReport,
  issues: RecoveryAssessmentIssue[] = []
): RecoveryAssessment {
  const hasFatal = issues.some((issue) => issue.severity === 'fatal');
  const hasWarnings = issues.some((issue) => issue.severity === 'warning');
  const needsRepair =
    report.missingAssetCount > 0 ||
    report.skippedMetadataCount > 0 ||
    report.orphanMetadataCount > 0 ||
    report.rescuedCutCount > 0 ||
    hasNormalization(report.normalizationFlags) ||
    hasWarnings;

  return {
    mode: hasFatal ? 'corrupted' : (needsRepair ? 'repairable' : 'full'),
    report,
    issues,
  };
}

export function listRecoveryNormalizationLabels(flags: RecoveryNormalizationFlags): string[] {
  const labels: string[] = [];
  if (flags.sceneIdsAssigned) labels.push('scene IDs assigned');
  if (flags.sceneOrderNormalized) labels.push('scene order normalized');
  if (flags.sceneStructureNormalized) labels.push('scene structure normalized');
  if (flags.metadataNormalized) labels.push('metadata normalized');
  return labels;
}

export function formatRecoveryAssessmentSummary(
  assessment: RecoveryAssessment,
  overrides: { rescuedCutCount?: number } = {}
): string {
  const rescuedCutCount = overrides.rescuedCutCount ?? assessment.report.rescuedCutCount;
  const parts = [
    `Mode: ${assessment.mode}.`,
    `Scenes read: ${assessment.report.readableSceneCount}.`,
    `Missing assets: ${assessment.report.missingAssetCount}.`,
    `Skipped metadata: ${assessment.report.skippedMetadataCount}.`,
    `Rescued cuts: ${rescuedCutCount}.`,
    `Orphan metadata: ${assessment.report.orphanMetadataCount}.`,
    `Project schema: v${assessment.report.projectSchemaVersion}.`,
    `Metadata schema: v${assessment.report.metadataSchemaVersion}.`,
  ];
  const normalized = listRecoveryNormalizationLabels(assessment.report.normalizationFlags);
  if (normalized.length > 0) {
    parts.push(`Normalizations: ${normalized.join(', ')}.`);
  }
  return parts.join(' ');
}
