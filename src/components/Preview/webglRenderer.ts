import type { Frame } from '../../state/graphEvaluator'

// ── Shaders ───────────────────────────────────────────────────────────────────

const VERT = `
  attribute vec2 a_pos;
  void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`

// Per-LED glow: each LED is a soft disc; nearby LEDs bleed light into each other.
const FRAG = `
  precision mediump float;
  uniform sampler2D u_frame;
  uniform vec2  u_grid;
  uniform float u_pixel;
  uniform vec2  u_res;

  void main() {
    // Flip Y so row 0 = top, matching JS frame layout
    vec2 pos  = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);
    vec2 cell = pos / u_pixel;
    vec2 ci   = floor(cell);
    vec2 cf   = fract(cell) - 0.5;  // -0.5..0.5, origin at LED centre

    // Off-grid → dark surround
    if (ci.x < 0.0 || ci.y < 0.0 || ci.x >= u_grid.x || ci.y >= u_grid.y) {
      gl_FragColor = vec4(0.04, 0.05, 0.07, 1.0);
      return;
    }

    // Sample own LED
    vec2 uv  = (ci + 0.5) / u_grid;
    vec3 led = texture2D(u_frame, uv).rgb;

    // Circular LED disc (smooth edge)
    float r    = length(cf);
    float core = smoothstep(0.47, 0.27, r);

    // Glow: 5×5 neighbourhood contribution
    vec3 glow = vec3(0.0);
    for (int dy = -2; dy <= 2; dy++) {
      for (int dx = -2; dx <= 2; dx++) {
        vec2 ni = ci + vec2(float(dx), float(dy));
        if (ni.x < 0.0 || ni.y < 0.0 || ni.x >= u_grid.x || ni.y >= u_grid.y) continue;
        vec3  nc  = texture2D(u_frame, (ni + 0.5) / u_grid).rgb;
        float nb  = dot(nc, vec3(0.299, 0.587, 0.114));
        if (nb < 0.015) continue;
        vec2  dlt = cell - (ni + 0.5);
        float d2  = dot(dlt, dlt);
        glow += nc * nb * exp(-d2 * 0.88);
      }
    }

    vec3 col = vec3(0.04, 0.05, 0.07)
             + glow * 0.17 * (1.0 - core * 0.65)
             + led  * core;
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  }
`

// ── Renderer class ────────────────────────────────────────────────────────────

export class WebGLLEDRenderer {
  private gl:          WebGLRenderingContext
  private program:     WebGLProgram
  private texture:     WebGLTexture
  private texData:     Uint8Array = new Uint8Array(4)
  private uGrid:       WebGLUniformLocation
  private uPixel:      WebGLUniformLocation
  private uRes:        WebGLUniformLocation
  private lastW = 0
  private lastH = 0

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', { antialias: false, powerPreference: 'high-performance' })
    if (!gl) throw new Error('WebGL unavailable')
    this.gl = gl

    this.program = this.buildProgram(VERT, FRAG)
    gl.useProgram(this.program)

    // Fullscreen quad
    const buf = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(this.program, 'a_pos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    this.uGrid  = gl.getUniformLocation(this.program, 'u_grid')!
    this.uPixel = gl.getUniformLocation(this.program, 'u_pixel')!
    this.uRes   = gl.getUniformLocation(this.program, 'u_res')!

    // Texture for frame data
    this.texture = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  }

  render(frame: Frame, gridW: number, gridH: number, pixel: number): void {
    const gl = this.gl
    const cw = gridW * pixel, ch = gridH * pixel

    if ((gl.canvas as HTMLCanvasElement).width  !== cw ||
        (gl.canvas as HTMLCanvasElement).height !== ch) {
      ;(gl.canvas as HTMLCanvasElement).width  = cw
      ;(gl.canvas as HTMLCanvasElement).height = ch
      gl.viewport(0, 0, cw, ch)
    }

    // Pack frame → RGBA Uint8Array
    if (this.lastW !== gridW || this.lastH !== gridH) {
      this.texData = new Uint8Array(gridW * gridH * 4)
      this.lastW = gridW; this.lastH = gridH
    }
    const d = this.texData
    for (let y = 0; y < gridH; y++) {
      for (let x = 0; x < gridW; x++) {
        const i = (y * gridW + x) * 4
        const p = frame[y]?.[x] ?? { r: 0, g: 0, b: 0 }
        d[i] = p.r; d[i+1] = p.g; d[i+2] = p.b; d[i+3] = 255
      }
    }

    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gridW, gridH, 0, gl.RGBA, gl.UNSIGNED_BYTE, d)

    gl.uniform2f(this.uGrid,  gridW, gridH)
    gl.uniform1f(this.uPixel, pixel)
    gl.uniform2f(this.uRes,   cw, ch)

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  destroy(): void {
    this.gl.deleteTexture(this.texture)
    this.gl.deleteProgram(this.program)
  }

  private buildProgram(vertSrc: string, fragSrc: string): WebGLProgram {
    const gl   = this.gl
    const vert = this.compileShader(gl.VERTEX_SHADER,   vertSrc)
    const frag = this.compileShader(gl.FRAGMENT_SHADER, fragSrc)
    const prog = gl.createProgram()!
    gl.attachShader(prog, vert); gl.attachShader(prog, frag)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(prog) ?? 'link error')
    return prog
  }

  private compileShader(type: number, src: string): WebGLShader {
    const gl     = this.gl
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, src)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(shader) ?? 'compile error')
    return shader
  }
}
