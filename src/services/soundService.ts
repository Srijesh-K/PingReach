/**
 * Sound Service using Web Audio API
 * Generates synthetic telephony tones (ringback, incoming ringtone, connect, hangup)
 * completely locally with zero network dependencies or file loading failures.
 */

class SoundService {
  private audioCtx: AudioContext | null = null;
  private activeLoopInterval: number | null = null;
  private isMuted: boolean = false;

  private getAudioContext(): AudioContext | null {
    try {
      if (typeof window === 'undefined') return null;
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return null;
      if (!this.audioCtx || this.audioCtx.state === 'closed') {
        this.audioCtx = new AudioContextClass();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      return this.audioCtx;
    } catch (err) {
      console.warn('AudioContext initialization failed:', err);
      return null;
    }
  }

  /**
   * Play standard outgoing ringback tone (repeating dual-tone burst: 440Hz + 480Hz)
   */
  public playOutgoingRing() {
    this.stopAll();
    if (this.isMuted) return;

    const playBurst = () => {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const duration = 1.6;

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(440, now);

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(480, now);

      // Smooth attack and release envelope to prevent audio clicking
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.08, now + 0.05);
      gainNode.gain.setValueAtTime(0.08, now + duration - 0.05);
      gainNode.gain.linearRampToValueAtTime(0, now + duration);

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + duration);
      osc2.stop(now + duration);
    };

    playBurst();
    this.activeLoopInterval = window.setInterval(playBurst, 4000);
  }

  /**
   * Play modern incoming call ringtone (melodic chime sequence: C5, E5, G5, C6)
   */
  public playIncomingRing() {
    this.stopAll();
    if (this.isMuted) return;

    const notes = [
      { freq: 523.25, time: 0.0, dur: 0.16 }, // C5
      { freq: 659.25, time: 0.18, dur: 0.16 }, // E5
      { freq: 783.99, time: 0.36, dur: 0.16 }, // G5
      { freq: 1046.5, time: 0.54, dur: 0.38 }, // C6
      { freq: 783.99, time: 1.0, dur: 0.16 },
      { freq: 1046.5, time: 1.18, dur: 0.4 },
    ];

    const playCycle = () => {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      notes.forEach(({ freq, time, dur }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + time);

        gain.gain.setValueAtTime(0, now + time);
        gain.gain.linearRampToValueAtTime(0.15, now + time + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + time + dur);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + time);
        osc.stop(now + time + dur);
      });
    };

    playCycle();
    this.activeLoopInterval = window.setInterval(playCycle, 2800);
  }

  /**
   * Play connected confirmation tone (ascending chime)
   */
  public playConnectedChime() {
    this.stopAll();
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [
      { freq: 587.33, time: 0.0, dur: 0.12 }, // D5
      { freq: 880.0, time: 0.14, dur: 0.22 }, // A5
    ];

    notes.forEach(({ freq, time, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + time);

      gain.gain.setValueAtTime(0, now + time);
      gain.gain.linearRampToValueAtTime(0.12, now + time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + time + dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + time);
      osc.stop(now + time + dur);
    });
  }

  /**
   * Play call ended tone (descending hangup beeps)
   */
  public playHangupTone() {
    this.stopAll();
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const beeps = [
      { freq: 440, time: 0.0, dur: 0.1 },
      { freq: 330, time: 0.14, dur: 0.18 },
    ];

    beeps.forEach(({ freq, time, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + time);

      gain.gain.setValueAtTime(0, now + time);
      gain.gain.linearRampToValueAtTime(0.1, now + time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + time + dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + time);
      osc.stop(now + time + dur);
    });
  }

  /**
   * Stop all active tones and loops
   */
  public stopAll() {
    if (this.activeLoopInterval !== null) {
      clearInterval(this.activeLoopInterval);
      this.activeLoopInterval = null;
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted) {
      this.stopAll();
    }
  }
}

export const soundService = new SoundService();
