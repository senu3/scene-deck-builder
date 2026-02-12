import type { StoreApi } from 'zustand';
import type { AppState } from '../stateTypes';

export type SliceSet = StoreApi<AppState>['setState'];
export type SliceGet = StoreApi<AppState>['getState'];
