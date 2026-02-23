import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef } from 'react';
import type { MediaSource } from './previewMedia';

export interface PlaybackState {
  isPlaying: boolean;
  currentIndex: number;
  // UI/playback control progress only. Do not use as canonical timeline definition.
  localProgress: number;
  inPoint: number | null;
  outPoint: number | null;
  isLooping: boolean;
  isBuffering: boolean;
  totalDuration: number;
  itemDurations: number[];
}

type PlaybackAction =
  | { type: 'SET_ITEMS'; durations: number[] }
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'TOGGLE' }
  | { type: 'SET_POSITION'; index: number; progress: number }
  | { type: 'SET_RANGE'; inPoint: number | null; outPoint: number | null }
  | { type: 'SET_LOOP'; loop: boolean }
  | { type: 'SET_BUFFERING'; buffering: boolean };

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function sumDurations(durations: number[]) {
  return durations.reduce((acc, d) => acc + d, 0);
}

function calculateAbsoluteTime(index: number, progress: number, durations: number[]) {
  let absolute = 0;
  for (let i = 0; i < index && i < durations.length; i++) {
    absolute += durations[i];
  }
  if (index < durations.length) {
    absolute += (progress / 100) * durations[index];
  }
  return absolute;
}

function findPositionFromTime(time: number, durations: number[]) {
  if (durations.length === 0) {
    return { index: 0, progress: 0 };
  }
  let accumulated = 0;
  for (let i = 0; i < durations.length; i++) {
    const duration = durations[i];
    if (accumulated + duration > time) {
      const localProgress = duration > 0 ? ((time - accumulated) / duration) * 100 : 0;
      return { index: i, progress: clamp(localProgress, 0, 100) };
    }
    accumulated += duration;
  }
  return { index: Math.max(0, durations.length - 1), progress: 100 };
}

function initState(durations: number[]): PlaybackState {
  return {
    isPlaying: false,
    currentIndex: 0,
    localProgress: 0,
    inPoint: null,
    outPoint: null,
    isLooping: false,
    isBuffering: false,
    totalDuration: sumDurations(durations),
    itemDurations: durations,
  };
}

function reducer(state: PlaybackState, action: PlaybackAction): PlaybackState {
  switch (action.type) {
    case 'SET_ITEMS': {
      const totalDuration = sumDurations(action.durations);
      const resetToStart = state.itemDurations.length === 0 && action.durations.length > 0;
      const maxIndex = Math.max(0, action.durations.length - 1);
      const nextIndex = resetToStart ? 0 : clamp(state.currentIndex, 0, maxIndex);
      const nextProgress = resetToStart ? 0 : clamp(state.localProgress, 0, 100);
      return {
        ...state,
        itemDurations: action.durations,
        totalDuration,
        currentIndex: nextIndex,
        localProgress: nextProgress,
      };
    }
    case 'PLAY':
      return { ...state, isPlaying: true };
    case 'PAUSE':
      return { ...state, isPlaying: false };
    case 'TOGGLE':
      return { ...state, isPlaying: !state.isPlaying };
    case 'SET_POSITION':
      return {
        ...state,
        currentIndex: action.index,
        localProgress: clamp(action.progress, 0, 100),
      };
    case 'SET_RANGE':
      return { ...state, inPoint: action.inPoint, outPoint: action.outPoint };
    case 'SET_LOOP':
      return { ...state, isLooping: action.loop };
    case 'SET_BUFFERING':
      return { ...state, isBuffering: action.buffering };
    default:
      return state;
  }
}

export function useSequencePlaybackController(itemDurations: number[]) {
  const [state, dispatch] = useReducer(reducer, itemDurations, initState);
  const committedStateRef = useRef(state);
  const renderStateRef = useRef(state);
  const sourceRef = useRef<MediaSource | null>(null);
  const pendingSeekRef = useRef<{ index: number; localTime: number } | null>(null);
  const stoppedAtOutPointRef = useRef(false);
  renderStateRef.current = state;

  useEffect(() => {
    dispatch({ type: 'SET_ITEMS', durations: itemDurations });
    stoppedAtOutPointRef.current = false;
  }, [itemDurations]);

  useLayoutEffect(() => {
    committedStateRef.current = state;
  }, [state]);

  useEffect(() => {
    stoppedAtOutPointRef.current = false;
  }, [state.currentIndex]);

  const getEffectiveRange = useCallback(() => {
    const current = committedStateRef.current;
    if (current.inPoint === null || current.outPoint === null) {
      return { inPoint: 0, outPoint: current.totalDuration };
    }
    return {
      inPoint: Math.min(current.inPoint, current.outPoint),
      outPoint: Math.max(current.inPoint, current.outPoint),
    };
  }, []);

  const seekWithIndex = useCallback((index: number, progress: number) => {
    const current = committedStateRef.current;
    if (current.itemDurations.length === 0) return;
    const duration = current.itemDurations[index] ?? 0;
    const localTime = (clamp(progress, 0, 100) / 100) * duration;
    if (index === current.currentIndex) {
      sourceRef.current?.seek(localTime);
    } else {
      pendingSeekRef.current = { index, localTime };
    }
  }, []);

  const setSource = useCallback((source: MediaSource | null) => {
    const previous = sourceRef.current;
    if (previous && previous !== source) {
      previous.dispose();
    }
    sourceRef.current = source;
    if (!source) return;

    const pending = pendingSeekRef.current;
    if (pending && pending.index === committedStateRef.current.currentIndex) {
      source.seek(pending.localTime);
      pendingSeekRef.current = null;
    }

    const current = committedStateRef.current;
    if (current.isPlaying && !current.isBuffering) {
      source.play();
    } else {
      source.pause();
    }
  }, []);

  const setRate = useCallback((rate: number) => {
    sourceRef.current?.setRate(rate);
  }, []);

  useEffect(() => {
    const source = sourceRef.current;
    if (!source) return;
    if (state.isPlaying && !state.isBuffering) {
      source.play();
    } else {
      source.pause();
    }
  }, [state.isPlaying, state.isBuffering, state.currentIndex]);

  const play = useCallback(() => dispatch({ type: 'PLAY' }), []);
  const pause = useCallback(() => dispatch({ type: 'PAUSE' }), []);
  const toggle = useCallback(() => dispatch({ type: 'TOGGLE' }), []);
  const setLooping = useCallback((loop: boolean) => dispatch({ type: 'SET_LOOP', loop }), []);
  const setRange = useCallback((inPoint: number | null, outPoint: number | null) => {
    dispatch({ type: 'SET_RANGE', inPoint, outPoint });
  }, []);
  const setBuffering = useCallback((buffering: boolean) => {
    dispatch({ type: 'SET_BUFFERING', buffering });
  }, []);

  const setPosition = useCallback((index: number, progress: number) => {
    dispatch({ type: 'SET_POSITION', index, progress });
    seekWithIndex(index, progress);
  }, [seekWithIndex]);

  const seekAbsolute = useCallback((time: number) => {
    const current = committedStateRef.current;
    const clamped = clamp(time, 0, current.totalDuration);
    const position = findPositionFromTime(clamped, current.itemDurations);
    setPosition(position.index, position.progress);
  }, [setPosition]);

  const seekPercent = useCallback((percent: number) => {
    const current = committedStateRef.current;
    if (current.totalDuration <= 0) return;
    const targetTime = (clamp(percent, 0, 100) / 100) * current.totalDuration;
    seekAbsolute(targetTime);
  }, [seekAbsolute]);

  const skip = useCallback((seconds: number) => {
    const current = committedStateRef.current;
    const absTime = calculateAbsoluteTime(current.currentIndex, current.localProgress, current.itemDurations);
    seekAbsolute(absTime + seconds);
  }, [seekAbsolute]);

  const goToNext = useCallback(() => {
    const current = committedStateRef.current;
    if (current.itemDurations.length === 0) return;
    const { inPoint, outPoint } = getEffectiveRange();

    const nextIndex = current.currentIndex + 1;
    if (nextIndex >= current.itemDurations.length) {
      if (current.isLooping) {
        const loopPosition = findPositionFromTime(inPoint, current.itemDurations);
        stoppedAtOutPointRef.current = false;
        dispatch({ type: 'SET_POSITION', index: loopPosition.index, progress: loopPosition.progress });
        seekWithIndex(loopPosition.index, loopPosition.progress);
      } else {
        const lastIndex = Math.max(0, current.itemDurations.length - 1);
        dispatch({ type: 'SET_POSITION', index: lastIndex, progress: 100 });
        dispatch({ type: 'PAUSE' });
      }
      return;
    }

    const nextItemStartTime = calculateAbsoluteTime(nextIndex, 0, current.itemDurations);
    if (current.inPoint !== null && current.outPoint !== null && nextItemStartTime >= outPoint) {
      if (current.isLooping) {
        const loopPosition = findPositionFromTime(inPoint, current.itemDurations);
        stoppedAtOutPointRef.current = false;
        dispatch({ type: 'SET_POSITION', index: loopPosition.index, progress: loopPosition.progress });
        seekWithIndex(loopPosition.index, loopPosition.progress);
      } else {
        const endPosition = findPositionFromTime(outPoint, current.itemDurations);
        dispatch({ type: 'SET_POSITION', index: endPosition.index, progress: endPosition.progress });
        dispatch({ type: 'PAUSE' });
      }
      return;
    }

    stoppedAtOutPointRef.current = false;
    dispatch({ type: 'SET_POSITION', index: nextIndex, progress: 0 });
    seekWithIndex(nextIndex, 0);
  }, [getEffectiveRange, seekWithIndex]);

  const goToPrev = useCallback(() => {
    stoppedAtOutPointRef.current = false;
    const nextIndex = Math.max(0, committedStateRef.current.currentIndex - 1);
    dispatch({ type: 'SET_POSITION', index: nextIndex, progress: 0 });
    seekWithIndex(nextIndex, 0);
  }, [seekWithIndex]);

  const tick = useCallback((localTime: number) => {
    // Hotpath rule (Gate 10): keep tick pure and lightweight (no I/O, process launch, analysis).
    const current = committedStateRef.current;
    if (current.itemDurations.length === 0) return;
    if (stoppedAtOutPointRef.current) return;

    const duration = current.itemDurations[current.currentIndex] ?? 0;
    const clampedLocal = clamp(localTime, 0, duration);
    const progress = duration > 0 ? (clampedLocal / duration) * 100 : 0;
    dispatch({ type: 'SET_POSITION', index: current.currentIndex, progress });

    if (current.isPlaying && current.inPoint !== null && current.outPoint !== null) {
      const { inPoint, outPoint } = getEffectiveRange();
      const absTime = calculateAbsoluteTime(current.currentIndex, progress, current.itemDurations);
      if (absTime >= outPoint) {
        if (current.isLooping) {
          const loopPosition = findPositionFromTime(inPoint, current.itemDurations);
          stoppedAtOutPointRef.current = false;
          dispatch({ type: 'SET_POSITION', index: loopPosition.index, progress: loopPosition.progress });
          seekWithIndex(loopPosition.index, loopPosition.progress);
        } else {
          stoppedAtOutPointRef.current = true;
          const endPosition = findPositionFromTime(outPoint, current.itemDurations);
          dispatch({ type: 'SET_POSITION', index: endPosition.index, progress: endPosition.progress });
          dispatch({ type: 'PAUSE' });
        }
        return;
      }
    }

  }, [getEffectiveRange, seekWithIndex]);

  const getAbsoluteTime = useCallback(() => {
    const current = renderStateRef.current;
    return calculateAbsoluteTime(current.currentIndex, current.localProgress, current.itemDurations);
  }, []);

  const getGlobalProgress = useCallback(() => {
    const current = renderStateRef.current;
    if (current.totalDuration <= 0) return 0;
    return clamp((getAbsoluteTime() / current.totalDuration) * 100, 0, 100);
  }, [getAbsoluteTime]);

  const selectors = useMemo(() => ({
    getAbsoluteTime,
    getGlobalProgress,
  }), [getAbsoluteTime, getGlobalProgress]);

  const getLiveAbsoluteTime = useCallback(() => {
    const current = committedStateRef.current;
    const source = sourceRef.current;
    if (!source) return getAbsoluteTime();
    const duration = current.itemDurations[current.currentIndex] ?? 0;
    if (duration <= 0) return getAbsoluteTime();
    const localTime = clamp(source.getCurrentTime(), 0, duration);
    const progress = (localTime / duration) * 100;
    return calculateAbsoluteTime(current.currentIndex, progress, current.itemDurations);
  }, [getAbsoluteTime]);

  return {
    state,
    setSource,
    setRate,
    play,
    pause,
    toggle,
    setLooping,
    setRange,
    setBuffering,
    setPosition,
    seekAbsolute,
    seekPercent,
    skip,
    goToNext,
    goToPrev,
    tick,
    selectors,
    getLiveAbsoluteTime,
  };
}
