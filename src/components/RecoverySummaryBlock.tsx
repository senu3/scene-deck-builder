import type { RecoveryAssessment } from '../features/project/recoveryAssessment';
import { listRecoveryNormalizationLabels } from '../features/project/recoveryAssessment';
import './RecoverySummaryBlock.css';

interface RecoverySummaryBlockProps {
  assessment: RecoveryAssessment;
  rescuedCutCount?: number;
}

export default function RecoverySummaryBlock({
  assessment,
  rescuedCutCount = assessment.report.rescuedCutCount,
}: RecoverySummaryBlockProps) {
  const normalizationLabels = listRecoveryNormalizationLabels(assessment.report.normalizationFlags);

  return (
    <section className={`recovery-summary recovery-summary-${assessment.mode}`}>
      <div className="recovery-summary-header">
        <h3>Recovery Report</h3>
        <span className="recovery-summary-mode">{assessment.mode}</span>
      </div>

      <div className="recovery-summary-grid">
        <div className="recovery-summary-stat">
          <span className="recovery-summary-label">Scenes Read</span>
          <strong>{assessment.report.readableSceneCount}</strong>
        </div>
        <div className="recovery-summary-stat">
          <span className="recovery-summary-label">Missing Assets</span>
          <strong>{assessment.report.missingAssetCount}</strong>
        </div>
        <div className="recovery-summary-stat">
          <span className="recovery-summary-label">Skipped Metadata</span>
          <strong>{assessment.report.skippedMetadataCount}</strong>
        </div>
        <div className="recovery-summary-stat">
          <span className="recovery-summary-label">Rescued Cuts</span>
          <strong>{rescuedCutCount}</strong>
        </div>
        <div className="recovery-summary-stat">
          <span className="recovery-summary-label">Orphan Metadata</span>
          <strong>{assessment.report.orphanMetadataCount}</strong>
        </div>
      </div>

      <div className="recovery-summary-meta">
        <span>Project schema v{assessment.report.projectSchemaVersion}</span>
        <span>Metadata schema v{assessment.report.metadataSchemaVersion}</span>
      </div>

      {normalizationLabels.length > 0 && (
        <p className="recovery-summary-normalized">
          Normalizations: {normalizationLabels.join(', ')}
        </p>
      )}

      {assessment.issues.length > 0 && (
        <ul className="recovery-summary-issues">
          {assessment.issues.map((issue) => (
            <li key={`${issue.code}-${issue.message}`}>{issue.message}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
