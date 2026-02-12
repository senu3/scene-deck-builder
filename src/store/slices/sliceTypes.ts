import type { StoreApi } from 'zustand';
import type { AppState } from '../useStore';

export type SliceSet = StoreApi<AppState>['setState'];
export type SliceGet = StoreApi<AppState>['getState'];
