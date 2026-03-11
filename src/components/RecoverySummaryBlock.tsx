import type { RecoveryAssessment } from '../features/project/recoveryAssessment';
import { getRecoveryAssessmentNotices } from '../features/project/recoveryAssessment';
import './RecoverySummaryBlock.css';

interface RecoverySummaryBlockProps {
  assessment: RecoveryAssessment;
  rescuedCutCount?: number;
}

export default function RecoverySummaryBlock({
  assessment,
  rescuedCutCount = assessment.report.rescuedCutCount,
}: RecoverySummaryBlockProps) {
  const notices = getRecoveryAssessmentNotices(assessment, 'modal', { rescuedCutCount });

  return (
    <section className={`recovery-summary recovery-summary-${assessment.mode}`}>
      <div className="recovery-summary-header">
        <h3>Before You Continue</h3>
      </div>
      {notices.length > 0 ? (
        <ul className="recovery-summary-issues">
          {notices.map((notice) => (
            <li key={notice}>{notice}</li>
          ))}
        </ul>
      ) : (
        <p className="recovery-summary-normalized">No recovery action is required.</p>
      )}
    </section>
  );
}
