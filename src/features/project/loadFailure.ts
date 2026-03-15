import type { AlertOptions } from '../../ui';
import type { ProjectFileLoadErrorCode } from '../platform/electronGateway';

export type ProjectLoadFailureCode =
  | ProjectFileLoadErrorCode
  | 'unsupported-schema'
  | 'invalid-project-structure'
  | 'asset-index-unreadable'
  | 'asset-index-invalid-schema'
  | 'project-corrupted-index-present'
  | 'project-vault-link-broken';

export interface ProjectLoadFailure {
  code: ProjectLoadFailureCode;
  projectPath: string;
  schemaVersion?: number;
}

function buildVaultGuidance(): string {
  return 'If you need to recover anything, check `assets/.index.json`.';
}

export function buildProjectLoadFailureAlert(failure: ProjectLoadFailure): AlertOptions {
  switch (failure.code) {
    case 'project-file-not-found':
      return {
        title: 'Project File Not Found',
        message: 'The project file could not be found.',
        variant: 'warning',
      };
    case 'unsupported-schema':
      return {
        title: 'Project File Is Damaged',
        message: `The project file is damaged. ${buildVaultGuidance()}`,
        variant: 'warning',
      };
    case 'invalid-project-structure':
      return {
        title: 'Project File Is Damaged',
        message: `The project file is damaged. ${buildVaultGuidance()}`,
        variant: 'warning',
      };
    case 'asset-index-unreadable':
      return {
        title: 'Asset Index Could Not Be Read',
        message: `The project file could not be opened because \`assets/.index.json\` could not be read. ${buildVaultGuidance()}`,
        variant: 'warning',
      };
    case 'asset-index-invalid-schema':
      return {
        title: 'Asset Index Is Damaged',
        message: `The project file could not be opened because \`assets/.index.json\` is damaged. ${buildVaultGuidance()}`,
        variant: 'warning',
      };
    case 'project-corrupted-index-present':
      return {
        title: 'Project File Is Damaged',
        message: `The project file is damaged. ${buildVaultGuidance()}`,
        variant: 'warning',
      };
    case 'project-vault-link-broken':
      return {
        title: 'Project File Could Not Be Opened',
        message: `The project file could not be opened. ${buildVaultGuidance()}`,
        variant: 'warning',
      };
    case 'invalid-json':
      return {
        title: 'Project File Is Damaged',
        message: `The project file is damaged. ${buildVaultGuidance()}`,
        variant: 'warning',
      };
    case 'read-failed':
    default:
      return {
        title: 'Project File Could Not Be Read',
        message: `The project file could not be read. ${buildVaultGuidance()}`,
        variant: 'warning',
      };
  }
}
