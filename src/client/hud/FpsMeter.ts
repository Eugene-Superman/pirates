import type { Text } from 'pixi.js';

const REPORT_INTERVAL_MS = 500;

// Average FPS over half a second + the longest frame in that time (shows stutters)
export class FpsMeter {
  private readonly text: Text;
  private frames = 0;
  private elapsedMs = 0;
  private worstFrameMs = 0;

  constructor(text: Text) {
    this.text = text;
  }

  update(frameMs: number) {
    this.frames++;
    this.elapsedMs += frameMs;
    this.worstFrameMs = Math.max(this.worstFrameMs, frameMs);
    if (this.elapsedMs >= REPORT_INTERVAL_MS) {
      const fps = (this.frames * 1000) / this.elapsedMs;
      this.text.text = `FPS: ${fps.toFixed(1)}   longest frame: ${this.worstFrameMs.toFixed(1)} ms`;
      this.frames = 0;
      this.elapsedMs = 0;
      this.worstFrameMs = 0;
    }
  }
}
