export interface CommandWarning {
  code: string;
  message: string;
}

export interface CommandApplyResult<TEffect = unknown, TWarning = CommandWarning> {
  nextState: 'delegated';
  effects: TEffect[];
  warnings: TWarning[];
}

export function createCommandApplyResult<TEffect, TWarning = CommandWarning>(
  effects: TEffect[] = [],
  warnings: TWarning[] = []
): CommandApplyResult<TEffect, TWarning> {
  return {
    nextState: 'delegated',
    effects,
    warnings,
  };
}
