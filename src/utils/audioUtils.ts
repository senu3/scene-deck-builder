/**
 * Web Audio API utilities for audio playback with fade in/out support
 */

/**
 * AudioManager class for managing audio playback with Web Audio API
 * Provides features like fade in/out, precise seeking, and offset support
 */
import type { AudioAnalysis } from '../types';
import { readAudioPcmBridge } from '../features/platform/electronGateway';

export class AudioManager {
  private audioContext: AudioContext | null = null;
  private audioBuffer: AudioBuffer | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;

  private isPlaying: boolean = false;
  private startTime: number = 0;      // AudioContext.currentTime when playback started
  private pausePosition: number = 0;  // Playback position when paused (seconds)
  private offset: number = 0;         // Audio offset in seconds (can be negative)
  private loadId: number = 0;         // Monotonic load id for cancellation
  private activeLoadId: number = 0;   // Last successful load id

  private fadeDuration: number = 0.1; // Fade duration in seconds
  private targetVolume: number = 1;   // Target volume (0-1)
  private disposed: boolean = false;  // Track if disposed

  constructor() {
    // Lazy initialization - AudioContext will be created when needed
  }

  /**
   * Check if manager has been disposed
   */
  isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Initialize audio context (lazy)
   */
  private initContext(): boolean {
    if (this.disposed) return false;
    if (this.audioContext) return true;

    try {
      this.audioContext = new AudioContext();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
      return true;
    } catch (error) {
      console.error('Failed to create AudioContext:', error);
      return false;
    }
  }

  /**
   * Load audio file from path
   * @param filePath - Absolute path to the audio file
   * @returns true if loaded successfully
   */
  async load(filePath: string): Promise<boolean> {
    if (this.disposed) return false;

    // Initialize context lazily
    if (!this.initContext() || !this.audioContext) return false;

    // Capture context reference to avoid race condition with dispose()
    const ctx = this.audioContext;
    const currentLoadId = ++this.loadId;

    try {
      console.debug('[Audio] load start', { filePath, loadId: currentLoadId });
      // Stop current playback (DO NOT close context)
      this.stopPlayback();

      // Read audio as PCM via ffmpeg in main process
      const pcmResult = await readAudioPcmBridge(filePath);
      if (!pcmResult || !pcmResult.success || !pcmResult.pcm || pcmResult.pcm.byteLength === 0) {
        if (pcmResult?.error) {
          console.warn('[Audio] PCM decode failed:', pcmResult.error);
        }
        return false;
      }

      // Check if disposed during async operation
      if (this.disposed) return false;
      if (currentLoadId !== this.loadId) return false;

      // Check if context was closed (by dispose)
      if ((ctx.state as string) === 'closed') return false;

      const { pcm, sampleRate = 44100, channels = 2 } = pcmResult;
      const bytes = pcm instanceof Uint8Array ? pcm : new Uint8Array(pcm);
      const sampleCount = Math.floor(bytes.byteLength / 2 / channels);
      if (sampleCount <= 0) return false;

      const audioBuffer = ctx.createBuffer(channels, sampleCount, sampleRate);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

      for (let ch = 0; ch < channels; ch++) {
        const channelData = audioBuffer.getChannelData(ch);
        let frameIndex = 0;
        for (let i = ch * 2; i < bytes.byteLength; i += channels * 2) {
          const sample = view.getInt16(i, true);
          channelData[frameIndex++] = sample / 32768;
        }
      }

      // Decode audio data (Promise version - errors go to catch)
      this.audioBuffer = audioBuffer;
      if (currentLoadId !== this.loadId) return false;
      this.activeLoadId = currentLoadId;
      console.debug('[Audio] load ok', { filePath, loadId: currentLoadId, duration: this.audioBuffer.duration });
      return true;
    } catch (e) {
      console.warn('Failed to load audio:', e);
      return false;
    }
  }

  /**
   * Stop playback without closing context (safe to call during load)
   */
  private stopPlayback(): void {
    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
      } catch {
        // Already stopped
      }
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    this.isPlaying = false;
    this.pausePosition = 0;
    this.audioBuffer = null;
  }

  /**
   * Unload current audio buffer without disposing the context
   */
  unload(): void {
    if (this.disposed) return;
    console.debug('[Audio] unload', { loadId: this.loadId });
    this.loadId++;
    this.stopPlayback();
  }

  /**
   * Start playback with optional fade in
   * @param fromPosition - Position in seconds to start from (defaults to pausePosition)
   */
  play(fromPosition?: number): void {
    if (this.disposed) return;

    // Ensure context is initialized
    if (!this.initContext()) return;
    if (!this.audioContext || !this.audioBuffer || !this.gainNode) return;

    // Resume audio context if suspended (browser policy)
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    // Stop any existing playback
    this.stop(false);

    // Create new source node
    this.sourceNode = this.audioContext.createBufferSource();
    this.sourceNode.buffer = this.audioBuffer;
    this.sourceNode.connect(this.gainNode);

    // Apply fade in
    this.gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
    this.gainNode.gain.linearRampToValueAtTime(
      this.targetVolume,
      this.audioContext.currentTime + this.fadeDuration
    );

    // Calculate start position with offset
    const position = fromPosition ?? this.pausePosition;
    const effectivePosition = Math.max(0, position + this.offset);

    // Only start if within audio duration
    if (effectivePosition < this.audioBuffer.duration) {
      this.sourceNode.start(0, effectivePosition);
      this.startTime = this.audioContext.currentTime - position;
      this.isPlaying = true;

      // Handle playback end
      this.sourceNode.onended = () => {
        if (this.isPlaying) {
          this.isPlaying = false;
          this.pausePosition = 0;
        }
      };
    }
  }

  /**
   * Pause playback with fade out
   */
  pause(): void {
    if (this.disposed) return;
    if (!this.isPlaying || !this.audioContext || !this.gainNode) return;

    this.pausePosition = this.getCurrentTime();

    // Fade out
    this.gainNode.gain.linearRampToValueAtTime(
      0,
      this.audioContext.currentTime + this.fadeDuration
    );

    // Stop after fade out completes
    setTimeout(() => this.stop(false), this.fadeDuration * 1000);
  }

  /**
   * Stop playback (does NOT close AudioContext)
   * @param resetPosition - Whether to reset pause position to 0
   */
  stop(resetPosition: boolean = true): void {
    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
      } catch {
        // Already stopped
      }
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    this.isPlaying = false;
    if (resetPosition) this.pausePosition = 0;
  }

  /**
   * Seek to a specific position
   * @param position - Position in seconds
   */
  seek(position: number): void {
    const wasPlaying = this.isPlaying;
    this.stop(false);
    this.pausePosition = Math.max(0, position);
    if (wasPlaying) {
      this.play(position);
    }
  }

  /**
   * Get current playback position in seconds
   */
  getCurrentTime(): number {
    if (!this.audioContext || !this.isPlaying) return this.pausePosition;
    return this.audioContext.currentTime - this.startTime;
  }

  /**
   * Set volume (0-1)
   * @param volume - Volume level between 0 and 1
   */
  setVolume(volume: number): void {
    this.targetVolume = Math.max(0, Math.min(1, volume));
    if (this.gainNode && this.audioContext) {
      // Smooth volume change
      this.gainNode.gain.linearRampToValueAtTime(
        this.targetVolume,
        this.audioContext.currentTime + 0.05
      );
    }
  }

  /**
   * Set muted state
   * @param muted - Whether audio should be muted
   */
  setMuted(muted: boolean): void {
    if (this.gainNode && this.audioContext) {
      this.gainNode.gain.linearRampToValueAtTime(
        muted ? 0 : this.targetVolume,
        this.audioContext.currentTime + 0.05
      );
    }
  }

  /**
   * Set audio offset in seconds
   * Positive values delay the audio, negative values make it play earlier
   * @param offset - Offset in seconds
   */
  setOffset(offset: number): void {
    this.offset = offset;
  }

  /**
   * Get audio offset
   */
  getOffset(): number {
    return this.offset;
  }

  /**
   * Get audio duration in seconds
   */
  getDuration(): number {
    return this.audioBuffer?.duration ?? 0;
  }

  /**
   * Check if audio is currently playing
   */
  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * Get current load counter
   */
  getLoadId(): number {
    return this.loadId;
  }

  /**
   * Check if audio is loaded
   */
  isLoaded(): boolean {
    return this.audioBuffer !== null;
  }

  /**
   * Return the last successful load id
   */
  getActiveLoadId(): number {
    return this.activeLoadId;
  }

  /**
   * Release all resources
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loadId++;

    this.stop();
    this.audioBuffer = null;
    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }
    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch {
        // Context might already be closed
      }
      this.audioContext = null;
    }
  }
}

function computeRmsFromPcm(
  bytes: Uint8Array,
  sampleRate: number,
  channels: number,
  fps: number
): number[] {
  const totalSamples = Math.floor(bytes.byteLength / 2 / channels);
  if (totalSamples <= 0) return [];

  const hop = Math.max(1, Math.round(sampleRate / fps));
  const windowSize = hop;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const rms: number[] = [];

  for (let start = 0; start < totalSamples; start += hop) {
    const end = Math.min(totalSamples, start + windowSize);
    let sumSq = 0;
    let count = 0;

    for (let i = start; i < end; i++) {
      let mono = 0;
      for (let ch = 0; ch < channels; ch++) {
        const sampleIndex = (i * channels + ch) * 2;
        const sample = view.getInt16(sampleIndex, true) / 32768;
        mono += sample;
      }
      mono /= channels;
      sumSq += mono * mono;
      count++;
    }

    const value = count > 0 ? Math.sqrt(sumSq / count) : 0;
    rms.push(Math.min(1, Math.max(0, value)));
  }

  return rms;
}

export async function analyzeAudioRms(
  filePath: string,
  fps: number = 60,
  hash?: string
): Promise<AudioAnalysis | null> {
  const result = await readAudioPcmBridge(filePath);
  if (!result?.success || !result.pcm) {
    if (result?.error) {
      console.warn('[Audio] RMS decode failed:', result.error);
    }
    return null;
  }

  const sampleRate = result.sampleRate ?? 44100;
  const channels = result.channels ?? 2;
  const bytes = result.pcm instanceof Uint8Array ? result.pcm : new Uint8Array(result.pcm);
  const totalSamples = Math.floor(bytes.byteLength / 2 / channels);
  if (totalSamples <= 0) return null;

  const rms = computeRmsFromPcm(bytes, sampleRate, channels, fps);
  const duration = totalSamples / sampleRate;

  return {
    fps,
    rms,
    duration,
    sampleRate,
    channels,
    hash,
  };
}

// NOTE: getAudioDuration using HTMLAudioElement was removed
// because mixing HTMLAudioElement and Web Audio API on the same file
// causes Chromium to crash in Electron.
// Use AudioManager.getDuration() after load() instead.

// ===== SINGLETON PATTERN =====
// AudioManager should be reused across the entire app lifecycle.
// Only dispose on app exit to prevent Chromium audio subsystem crashes.

let globalAudioManager: AudioManager | null = null;

/**
 * Get the global AudioManager instance (singleton)
 * Creates a new instance if none exists
 */
export function getGlobalAudioManager(): AudioManager {
  if (!globalAudioManager || globalAudioManager.isDisposed()) {
    globalAudioManager = new AudioManager();
  }
  return globalAudioManager;
}

/**
 * Dispose the global AudioManager (call only on app exit)
 */
export function disposeGlobalAudioManager(): void {
  if (globalAudioManager) {
    globalAudioManager.dispose();
    globalAudioManager = null;
  }
}

// Register cleanup on window unload (app exit)
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    disposeGlobalAudioManager();
  });
}
