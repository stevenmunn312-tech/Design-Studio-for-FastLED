import type { Frame } from '../../state/graphEvaluator'
import { PREVIEW_STYLE_CODE, isDiffusedStyle, type PreviewStyle } from './previewStyles'

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
  uniform float u_style;

  void main() {
    // Flip Y so row 0 = top, matching JS frame layout
    vec2 pos  = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);
    vec2 baseUv = pos / u_res;
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
    float ledLum = dot(led, vec3(0.299, 0.587, 0.114));

    // Circular LED disc (smooth edge)
    float r    = length(cf);
    float core = smoothstep(0.5, 0.17, r);
    float halo = smoothstep(0.98, 0.22, r) * (1.0 - core * 0.5);

    // Glow: 7×7 neighbourhood contribution
    vec3 glow = vec3(0.0);
    for (int dy = -3; dy <= 3; dy++) {
      for (int dx = -3; dx <= 3; dx++) {
        vec2 ni = ci + vec2(float(dx), float(dy));
        if (ni.x < 0.0 || ni.y < 0.0 || ni.x >= u_grid.x || ni.y >= u_grid.y) continue;
        vec3  nc  = texture2D(u_frame, (ni + 0.5) / u_grid).rgb;
        float nb  = dot(nc, vec3(0.299, 0.587, 0.114));
        if (nb < 0.015) continue;
        vec2  dlt = cell - (ni + 0.5);
        float d2  = dot(dlt, dlt);
        glow += nc * (0.4 + nb * 1.18) * exp(-d2 * 0.42);
      }
    }

    vec3 col;
    if (u_style > 0.5) {
      vec3 nearField = vec3(0.0);
      vec3 farField = vec3(0.0);
      float nearWeight = 0.0;
      float farWeight = 0.0;
      for (int dy = -6; dy <= 6; dy++) {
        for (int dx = -6; dx <= 6; dx++) {
          vec2 step = vec2(float(dx), float(dy));
          float d2 = dot(step, step);
          vec2 uvNear = clamp(baseUv + step / u_grid * 0.42, vec2(0.0), vec2(1.0));
          vec2 uvFar  = clamp(baseUv + step / u_grid * 1.05, vec2(0.0), vec2(1.0));
          float wNear = exp(-d2 * 0.22);
          float wFar  = exp(-d2 * 0.065);
          nearField += texture2D(u_frame, uvNear).rgb * wNear;
          farField  += texture2D(u_frame, uvFar).rgb * wFar;
          nearWeight += wNear;
          farWeight += wFar;
        }
      }
      nearField /= max(nearWeight, 0.0001);
      farField /= max(farWeight, 0.0001);

      vec3 hazeField = mix(farField, nearField, 0.38);
      float haze = clamp(dot(hazeField, vec3(0.24, 0.48, 0.18)) * 1.8, 0.0, 1.0);
      vec3 luma = vec3(dot(hazeField, vec3(0.299, 0.587, 0.114)));
      vec3 saturatedField = hazeField + (hazeField - luma) * 0.62;
      vec3 edgeField = max(nearField * 1.45 - farField * 0.92, vec3(0.0));
      vec3 edgeLuma = vec3(dot(edgeField, vec3(0.299, 0.587, 0.114)));
      vec3 edgeNeon = edgeField + (edgeField - edgeLuma) * 1.2;
      float edgeGlow = clamp(dot(edgeNeon, vec3(0.25, 0.5, 0.25)) * 2.4, 0.0, 1.0);
      vec3 cyberTint = vec3(hazeField.r * 1.14, hazeField.g * 1.02, hazeField.b * 1.22);
      vec3 milk = vec3(0.16, 0.1, 0.22) * haze * 0.14;

      if (u_style < 1.5) {
        col = vec3(0.024, 0.02, 0.044)
            + vec3(0.08, 0.08, 0.12) * haze * 0.1
            + farField * 0.68
            + hazeField * 0.72
            + glow * 0.022
            + led * (0.004 + ledLum * 0.008);
        col = mix(col, vec3(dot(col, vec3(0.25, 0.5, 0.25))), 0.08);
        col *= 0.98;
      } else if (u_style < 2.5) {
        col = vec3(0.032, 0.024, 0.06)
            + vec3(0.14, 0.12, 0.2) * haze * 0.2
            + farField * 0.82
            + hazeField * 0.58
            + glow * 0.018
            + led * (0.003 + ledLum * 0.006);
        col = mix(col, vec3(dot(col, vec3(0.25, 0.5, 0.25))), 0.11);
        col *= 1.02;
      } else if (u_style < 3.5) {
        col = vec3(0.034, 0.02, 0.072)
            + milk
            + farField * 0.26
            + saturatedField * 0.42
            + cyberTint * 0.34
            + edgeNeon * 0.68
            + glow * 0.05
            + led * (0.014 + ledLum * 0.022);
        col = mix(col, vec3(dot(col, vec3(0.25, 0.5, 0.25))), 0.02);
        col *= 1.14;
      } else if (u_style < 4.5) {
        col = vec3(0.03, 0.015, 0.058)
            + milk
            + farField * 0.22
            + saturatedField * 0.3
            + cyberTint * 0.18
            + edgeNeon * 1.08
            + vec3(0.1, 0.03, 0.16) * edgeGlow * 0.26
            + glow * 0.035
            + led * (0.014 + ledLum * 0.02);
        col = mix(col, vec3(dot(col, vec3(0.25, 0.5, 0.25))), 0.01);
        col *= 1.18;
      } else {
        float scan = 0.92 + 0.08 * sin(pos.y * 1.4);
        col = vec3(0.028, 0.018, 0.058)
            + vec3(0.08, 0.06, 0.12) * haze * 0.1
            + farField * 0.24
            + saturatedField * 0.34
            + edgeNeon * 0.72
            + glow * 0.06
            + led * (0.015 + ledLum * 0.022);
        col *= scan * 1.08;
      }
    } else {
      col = vec3(0.04, 0.05, 0.07)
          + glow * (0.3 + halo * 0.2)
          + led  * (core + halo * 0.24);
    }

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
  private uStyle:      WebGLUniformLocation
  private lastW = 0
  private lastH = 0
  private lastCanvasW = 0
  private lastCanvasH = 0
  private lastDiffusion = false

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
    this.uStyle = gl.getUniformLocation(this.program, 'u_style')!

    // Texture for frame data
    this.texture = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  }

  render(frame: Frame, gridW: number, gridH: number, pixel: number, style: PreviewStyle): void {
    const gl = this.gl
    const cw = gridW * pixel, ch = gridH * pixel
    const diffused = isDiffusedStyle(style)

    if ((gl.canvas as HTMLCanvasElement).width  !== cw ||
        (gl.canvas as HTMLCanvasElement).height !== ch) {
      ;(gl.canvas as HTMLCanvasElement).width  = cw
      ;(gl.canvas as HTMLCanvasElement).height = ch
    }

    if (this.lastCanvasW !== cw || this.lastCanvasH !== ch) {
      gl.viewport(0, 0, cw, ch)
      this.lastCanvasW = cw
      this.lastCanvasH = ch
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
    const filter = diffused ? gl.LINEAR : gl.NEAREST
    if (this.lastDiffusion !== diffused) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
      this.lastDiffusion = diffused
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gridW, gridH, 0, gl.RGBA, gl.UNSIGNED_BYTE, d)

    gl.uniform2f(this.uGrid,  gridW, gridH)
    gl.uniform1f(this.uPixel, pixel)
    gl.uniform2f(this.uRes,   cw, ch)
    gl.uniform1f(this.uStyle, PREVIEW_STYLE_CODE[style])

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
