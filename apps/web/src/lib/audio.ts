// Web Audio API utility for scan feedback beeps.
// All functions silently no-op if AudioContext is not supported.

type BeepType = 'success' | 'duplicate' | 'error';

/**
 * Play a single oscillator tone.
 *
 * @param ctx       - An already-running AudioContext
 * @param frequency - Tone frequency in Hz
 * @param duration  - Duration in seconds
 * @param startAt   - AudioContext time to start the tone
 * @param type      - OscillatorType (default 'square' for a scanner-like sound)
 * @param gain      - Output volume 0–1 (default 0.3)
 */
function playTone(
  ctx: AudioContext,
  frequency: number,
  duration: number,
  startAt: number,
  type: OscillatorType = 'square',
  gain: number = 0.3
): void {
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startAt);

  // Short attack/release ramp to avoid clicks
  gainNode.gain.setValueAtTime(0, startAt);
  gainNode.gain.linearRampToValueAtTime(gain, startAt + 0.005);
  gainNode.gain.setValueAtTime(gain, startAt + duration - 0.01);
  gainNode.gain.linearRampToValueAtTime(0, startAt + duration);

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  oscillator.start(startAt);
  oscillator.stop(startAt + duration);
}

/**
 * Play a beep pattern for a scan outcome.
 *
 * Patterns:
 *   success   – 1 short high-pitched beep  (1880 Hz, 120 ms, square wave)
 *   duplicate – 2 medium beeps             (880 Hz,  120 ms each, 80 ms gap, square wave)
 *   error     – 1 longer low-pitched beep  (220 Hz,  400 ms, sawtooth wave)
 */
export function playBeep(type: BeepType): void {
  if (typeof window === 'undefined') return;
  if (!window.AudioContext && !(window as any).webkitAudioContext) return;

  try {
    const AudioContextClass: typeof AudioContext =
      window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContextClass();

    const now = ctx.currentTime;

    switch (type) {
      case 'success':
        // 1 short high-pitched beep — classic "good scan" sound
        playTone(ctx, 1880, 0.12, now, 'square', 0.3);
        break;

      case 'duplicate':
        // 2 medium beeps — warning: already scanned
        playTone(ctx, 880, 0.12, now, 'square', 0.3);
        playTone(ctx, 880, 0.12, now + 0.20, 'square', 0.3);
        break;

      case 'error':
        // 1 longer low-pitched beep — error/not found
        playTone(ctx, 220, 0.40, now, 'sawtooth', 0.3);
        break;
    }

    // Close the context after all tones have finished to free resources.
    // The longest pattern (error) is 400 ms; add 200 ms headroom.
    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 700);

  } catch {
    // Silently ignore — audio is non-critical
  }
}
