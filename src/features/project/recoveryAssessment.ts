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

export type RecoveryAssessmentNoticeContext = 'load' | 'save' | 'modal';

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

function hasStructuralNormalization(flags: RecoveryNormalizationFlags): boolean {
  return flags.sceneIdsAssigned || flags.sceneOrderNormalized || flags.sceneStructureNormalized;
}

export function getRecoveryAssessmentNotices(
  assessment: RecoveryAssessment,
  context: RecoveryAssessmentNoticeContext,
  overrides: { rescuedCutCount?: number } = {}
): string[] {
  const rescuedCutCount = overrides.rescuedCutCount ?? assessment.report.rescuedCutCount;
  const notices: string[] = [];

  if (assessment.report.missingAssetCount > 0) {
    notices.push(
      context === 'save'
        ? `${assessment.report.missingAssetCount} asset reference(s) are missing.`
        : `${assessment.report.missingAssetCount} file(s) could not be found.`
    );
  }

  if (assessment.report.skippedMetadataCount > 0) {
    notices.push(
      context === 'save'
        ? 'Some metadata will be ignored.'
        : 'Some metadata was ignored during load.'
    );
  }

  if (rescuedCutCount > 0 && context !== 'save') {
    notices.push(`${rescuedCutCount} cut(s) were relinked.`);
  }

  if (context === 'save' && hasStructuralNormalization(assessment.report.normalizationFlags)) {
    notices.push('Project structure will be normalized before save.');
  }

  if (context !== 'save' && assessment.report.readableSceneCount === 0) {
    notices.push('No readable scenes were recovered.');
  }

  return notices;
}

export function formatRecoveryAssessmentSummary(
  assessment: RecoveryAssessment,
  context: RecoveryAssessmentNoticeContext,
  overrides: { rescuedCutCount?: number } = {}
): string {
  return getRecoveryAssessmentNotices(assessment, context, overrides).join(' ');
}
