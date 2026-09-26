import { usesShims, cppRewriteShims } from '../../state/fastledShims'
import { isNodeFormulaValid } from '../../state/formulaLang'
import type { NodeEmitters } from '../../codegen/emitContext'

export const CODE_EMITTERS: NodeEmitters = {
  CustomFormula({ node, p, ln, f, ownBuf, paletteExpr, needsT, needsShims, needsPhi }) {
    needsT.v = true
    const raw = String(p.formula ?? 'sin(x*6+t)*0.5+0.5')
    // Fail closed on anything the sandboxed parser rejects: a formula
    // arrives inside a shared graph, and an unvalidated string pasted
    // into an expression is a C++ injection hole. `validateGraph` blocks
    // export/upload on the same check, so this is the last line rather
    // than the message the user sees.
    const safe = isNodeFormulaValid(raw)
    if (safe && usesShims(raw)) needsShims.v = true
    if (safe && /\bPHI\b/.test(raw)) needsPhi.v = true
    const formula = safe ? cppRewriteShims(raw).replace(/\*\//g, '* /') : '0.0f'
    const ob = ownBuf()
    const pal = paletteExpr(node.id, 'paletteIn', p)
    ln(`  { /* CustomFormula: ${safe ? raw.replace(/\*\//g, '* /') : 'invalid formula — rendering blank' } */`)
    ln(`    float a=${f('a', 'a', 0)}, b=${f('b', 'b', 0)}; (void)a; (void)b;`)
    ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
    ln(`      float x=(float)_x/(WIDTH-1>0?WIDTH-1:1),y=(float)_y/(HEIGHT-1>0?HEIGHT-1:1);`)
    ln(`      float cx=((float)_x-WIDTH/2.0f)/(WIDTH/2.0f),cy=((float)_y-HEIGHT/2.0f)/(HEIGHT/2.0f);`)
    ln(`      float r=sqrtf(cx*cx+cy*cy),angle=atan2f(cy,cx); (void)cx;(void)cy;(void)r;(void)angle;`)
    ln(`      float _v=${formula};`)
    ln(`      ${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)(fmod(fmod(_v,1)+1,1)*255));}}`)
  },
  Code({ node, id, p, ln, ownBuf, srcBuf, nativeMultiRender, globalLines, needsT, persistentFrameStateBufs }) {
    // Paste-through: the user's FastLED loop body writes into leds[], aliased
    // to this node's (global, persistent) buffer. A wired frame input seeds
    // it each loop; unwired the buffer persists, so fadeToBlackBy accumulates
    // trails the same way the live preview does.
    needsT.v = true
    const ob = ownBuf()
    const src = srcBuf('frame')
    const codeBuffer = nativeMultiRender && !src ? `_passState_${id}` : ob
    if (nativeMultiRender && !src) persistentFrameStateBufs.add(id)
    const global = String(p.globalCode ?? '').trim()
    const code = String(p.code ?? '')
    if (global) {
      globalLines.push(`// ── Code node ${node.id} — globals ──`)
      for (const line of global.split('\n')) globalLines.push(line)
      globalLines.push(``)
    }
    ln(`  {`)
    if (src) ln(`    ::memmove(${ob}, ${src}, sizeof(CRGB) * NUM_LEDS);`)
    ln(`    CRGB* leds = ${codeBuffer}; (void)leds;`)
    for (const line of code.split('\n')) ln(`    ${line}`)
    if (nativeMultiRender && !src) ln(`    ::memmove(${ob}, ${codeBuffer}, sizeof(CRGB) * NUM_LEDS);`)
    ln(`  }`)
  },
}
