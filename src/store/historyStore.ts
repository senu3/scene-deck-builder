import { create } from 'zustand';

/**
 * Command Pattern Interface
 * すべてのUndoable操作はこのインターフェースを実装する
 */
export interface Command {
  type: string;
  description: string;
  execute: () => void | Promise<void>;
  undo: () => void | Promise<void>;
}

/**
 * History Store State
 */
interface HistoryState {
  past: Command[];
  future: Command[];
  maxHistory: number;

  // Actions
  executeCommand: (command: Command) => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  canUndo: () => boolean;
  canRedo: () => boolean;
  getUndoPreview: () => { type: string; description: string } | null;
  clear: () => void;
}

/**
 * History Store
 * コマンドパターンベースのUndo/Redoシステム
 */
export const useHistoryStore = create<HistoryState>((set, get) => ({
  past: [],
  future: [],
  maxHistory: 50, // 最大50コマンドの履歴を保持

  /**
   * コマンドを実行し、履歴に追加
   */
  executeCommand: async (command: Command) => {
    try {
      // コマンドを実行
      await command.execute();

      // 履歴に追加
      set((state) => {
        const newPast = [...state.past, command];

        // 最大履歴数を超えた場合、古いコマンドを削除
        if (newPast.length > state.maxHistory) {
          newPast.shift();
        }

        return {
          past: newPast,
          future: [], // 新しいコマンド実行時はfutureをクリア
        };
      });
    } catch (error) {
      console.error('Command execution failed:', error);
      throw error;
    }
  },

  /**
   * 最後のコマンドをUndo
   */
  undo: async () => {
    const { past } = get();

    if (past.length === 0) {
      console.warn('No commands to undo');
      return;
    }

    const command = past[past.length - 1];

    try {
      // Undoを実行
      await command.undo();

      // 履歴を更新
      set((state) => ({
        past: state.past.slice(0, -1),
        future: [command, ...state.future],
      }));
    } catch (error) {
      console.error('Undo failed:', error);
      throw error;
    }
  },

  /**
   * 最後にUndoしたコマンドをRedo
   */
  redo: async () => {
    const { future } = get();

    if (future.length === 0) {
      console.warn('No commands to redo');
      return;
    }

    const command = future[0];

    try {
      // Redoを実行
      await command.execute();

      // 履歴を更新
      set((state) => ({
        past: [...state.past, command],
        future: state.future.slice(1),
      }));
    } catch (error) {
      console.error('Redo failed:', error);
      throw error;
    }
  },

  /**
   * Undo可能かどうかをチェック
   */
  canUndo: () => {
    return get().past.length > 0;
  },

  /**
   * Redo可能かどうかをチェック
   */
  canRedo: () => {
    return get().future.length > 0;
  },

  /**
   * 次に Undo されるコマンドの要約を取得
   */
  getUndoPreview: () => {
    const { past } = get();
    if (past.length === 0) return null;
    const command = past[past.length - 1];
    return { type: command.type, description: command.description };
  },

  /**
   * 履歴をクリア（新しいプロジェクト読み込み時など）
   */
  clear: () => {
    set({
      past: [],
      future: [],
    });
  },
}));
