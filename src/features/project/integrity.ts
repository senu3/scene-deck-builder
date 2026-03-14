import type { MetadataStoreReport } from '../../utils/metadataStore';
import type { AssetIndexReadResult } from '../platform/electronGateway';
import {
  createRecoveryAssessment,
  type RecoveryAssessment,
  type RecoveryNormalizationFlags,
} from './recoveryAssessment';

export interface ProjectIntegrityAssessmentInput {
  readableSceneCount: number;
  missingAssetCount: number;
  assetIndexState?: AssetIndexReadResult['kind'];
  metadataReport: MetadataStoreReport;
  rescuedCutCount?: number;
  projectSchemaVersion?: number;
  normalizationFlags?: Partial<RecoveryNormalizationFlags>;
}

function buildAssetIndexIssue(
  assetIndexState: AssetIndexReadResult['kind'] | undefined
): { severity: 'warning'; code: string; message: string } | null {
  switch (assetIndexState) {
    case 'missing':
      return {
        severity: 'warning',
        code: 'asset-index-missing',
        message: 'Asset index file is missing.',
      };
    case 'unreadable':
      return {
        severity: 'warning',
        code: 'asset-index-unreadable',
        message: 'Asset index file could not be read.',
      };
    case 'invalid-schema':
      return {
        severity: 'warning',
        code: 'asset-index-invalid-schema',
        message: 'Asset index file is invalid.',
      };
    default:
      return null;
  }
}

export function createProjectIntegrityAssessment(
  input: ProjectIntegrityAssessmentInput
): RecoveryAssessment {
  const issues = [];
  if (input.missingAssetCount > 0) {
    issues.push({
      severity: 'warning' as const,
      code: 'missing-assets',
      message: `${input.missingAssetCount} asset reference(s) could not be restored.`,
    });
  }

  const assetIndexIssue = buildAssetIndexIssue(input.assetIndexState);
  if (assetIndexIssue) {
    issues.push(assetIndexIssue);
  }

  if (input.metadataReport.skippedMetadataCount > 0) {
    issues.push({
      severity: 'warning' as const,
      code: 'skipped-metadata',
      message: `${input.metadataReport.skippedMetadataCount} metadata item(s) were skipped.`,
    });
  }

  if (input.metadataReport.orphanMetadataCount > 0) {
    issues.push({
      severity: 'warning' as const,
      code: 'orphan-metadata',
      message: `${input.metadataReport.orphanMetadataCount} orphan metadata item(s) were detected.`,
    });
  }

  return createRecoveryAssessment({
    readableSceneCount: input.readableSceneCount,
    missingAssetCount: input.missingAssetCount,
    skippedMetadataCount: input.metadataReport.skippedMetadataCount,
    rescuedCutCount: input.rescuedCutCount ?? 0,
    orphanMetadataCount: input.metadataReport.orphanMetadataCount,
    projectSchemaVersion: input.projectSchemaVersion ?? 3,
    metadataSchemaVersion: input.metadataReport.metadataSchemaVersion,
    normalizationFlags: {
      sceneIdsAssigned: input.normalizationFlags?.sceneIdsAssigned ?? false,
      sceneOrderNormalized: input.normalizationFlags?.sceneOrderNormalized ?? false,
      sceneStructureNormalized: input.normalizationFlags?.sceneStructureNormalized ?? false,
      metadataNormalized: input.normalizationFlags?.metadataNormalized ?? input.metadataReport.normalized,
    },
  }, issues);
}
