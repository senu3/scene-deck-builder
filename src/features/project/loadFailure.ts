import type { AlertOptions } from '../../ui';
import type { ProjectFileLoadErrorCode } from '../platform/electronGateway';

export type ProjectLoadFailureCode =
  | ProjectFileLoadErrorCode
  | 'unsupported-schema'
  | 'invalid-project-structure';

export interface ProjectLoadFailure {
  code: ProjectLoadFailureCode;
  projectPath: string;
  schemaVersion?: number;
}

function buildVaultGuidance(): string {
  return 'Check the vault files `project.sdp`, `assets/.index.json`, and `.metadata.json`. You can create a new project and reuse files from `assets/`, but `.index.json` alone does not restore scene order or timing.';
}

export function buildProjectLoadFailureAlert(failure: ProjectLoadFailure): AlertOptions {
  switch (failure.code) {
    case 'project-file-not-found':
      return {
        title: 'Project File Not Found',
        message: 'The selected project file was not found. It may have been moved or deleted.',
        variant: 'warning',
      };
    case 'unsupported-schema': {
      const schemaMessage = typeof failure.schemaVersion === 'number'
        ? `Detected schema version: v${failure.schemaVersion}.`
        : 'This file does not declare the supported schema version (v3).';
      return {
        title: 'Unsupported Project File',
        message: `${schemaMessage} Only v3 project files can be opened. ${buildVaultGuidance()}`,
        variant: 'warning',
      };
    }
    case 'invalid-project-structure':
      return {
        title: 'Project File Is Damaged',
        message: `The project file structure is incomplete or invalid. ${buildVaultGuidance()}`,
        variant: 'warning',
      };
    case 'invalid-json':
      return {
        title: 'Project File Is Damaged',
        message: `The project file could not be parsed as JSON. ${buildVaultGuidance()}`,
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
