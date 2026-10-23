// Renderers that draw WebGL with the processor: SwiftShader (Chrome and Edge with graphics acceleration turned off,
// or without a usable graphics driver), Mesa's llvmpipe and softpipe, Windows' Basic Render Driver
const SOFTWARE = /swiftshader|llvmpipe|softpipe|basic render|software/i;

/** What draws the game */
export interface GpuInfo {
  /** The renderer as the browser names it: the graphics card, or what stands in for one */
  readonly name: string;
  /** No graphics card draws the game: the processor does, many times slower */
  readonly software: boolean;
}

function context(attributes?: WebGLContextAttributes) {
  const canvas = document.createElement('canvas');
  return canvas.getContext('webgl2', attributes) ?? canvas.getContext('webgl', attributes);
}

function release(gl: WebGLRenderingContext | WebGL2RenderingContext | null) {
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
}

/**
 * Asks the browser what will draw the game, before the game's own WebGL context is made (its smoothing is fixed
 * then): drawing in software, the game leaves out what costs the processor most (main.ts). The contexts it opens to
 * ask are given back at once
 */
export function probeGpu(): GpuInfo {
  const gl = context();
  if (!gl) return { name: 'no WebGL', software: true };
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const named: unknown = gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
  const name = typeof named === 'string' ? named : 'unknown';
  // A browser that hides the renderer's name may still refuse a context "much slower than usual"
  const fast = context({ failIfMajorPerformanceCaveat: true });
  const software = !fast || SOFTWARE.test(name);
  release(fast);
  release(gl);
  return { name, software };
}
