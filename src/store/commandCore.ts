export interface CommandApplyResult<TEffect = unknown> {
  nextState: 'delegated';
  effects: TEffect[];
}

export function createCommandApplyResult<TEffect>(
  effects: TEffect[] = []
): CommandApplyResult<TEffect> {
  return {
    nextState: 'delegated',
    effects,
  };
}
