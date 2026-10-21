/*
 * The one page a Web Remote serves, generated once for both places it runs.
 *
 * The firmware embeds this exact text in PROGMEM and serves it at `/`; the
 * studio's phone preview loads the same text into a sandboxed `srcdoc` frame.
 * One generator is what keeps the two from drifting: the preview is the page
 * the phone will get, not a picture of it.
 *
 * The page finds out which side it is on by itself. A `srcdoc` frame's address
 * is `about:srcdoc`, so there it posts each change to the studio window with
 * `postMessage`; on the board it fetches `/s` for state and posts `/set` with
 * an index and a value. Either way the reply is the whole state as an array,
 * one number per control, so a second phone catches up on its next poll.
 *
 * Everything an author typed (the title, labels, options, on/off words)
 * reaches the page only as HTML-escaped text or attribute values. The script
 * is static: it reads numbers out of `data-` attributes and never builds
 * markup from strings, so no label can become code.
 */

import {
  type WebRemoteControl,
  webRemoteChoiceOptions,
  webRemoteControlKind,
  webRemoteHueStops,
  webRemoteStartState,
  webRemoteStateRange,
  webRemoteTitle,
} from './webRemote'
import { displayPickerTone } from '../displays/displayRegistry'

/** HTML text or a double-quoted attribute value. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** A finite number as page text; anything else as 0. */
function num(value: unknown): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return '0'
  return String(Math.round(n * 1e6) / 1e6)
}

/** Decimal places worth showing for a step: its own, at most four. */
function decimals(step: number): number {
  const fraction = num(step).split('.')[1] ?? ''
  return Math.min(4, fraction.length)
}

function startNumber(control: WebRemoteControl): number {
  const start = webRemoteStartState(control)
  return typeof start === 'boolean' ? (start ? 1 : 0) : typeof start === 'number' ? start : 0
}

function controlHtml(control: WebRemoteControl, index: number): string {
  const kind = webRemoteControlKind(control.type)
  const label = escapeHtml(control.label)
  const id = `c${index}`
  const range = webRemoteStateRange(control)
  const start = startNumber(control)
  const startText = kind === 'text' ? String(webRemoteStartState(control)) : ''
  const head = `<section class="c" data-i="${index}" data-k="${kind}"`
    + ` data-min="${num(range.min)}" data-max="${num(range.max)}" data-step="${num(range.step)}"`
    + ` data-d="${decimals(range.step)}" data-v="${kind === 'text' ? escapeHtml(startText) : num(start)}"`
  switch (kind) {
    case 'press': {
      const text = escapeHtml(String(control.properties.text ?? '') || control.label)
      return `${head}><span class="l">${label}</span>`
        + `<button class="b" type="button" aria-pressed="false">${text}</button></section>`
    }
    case 'latch': {
      const off = escapeHtml(String(control.properties.offLabel ?? 'OFF'))
      const on = escapeHtml(String(control.properties.onLabel ?? 'ON'))
      return `${head} data-off="${off}" data-on="${on}"><span class="l" id="${id}">${label}</span>`
        + `<button class="t" type="button" aria-pressed="false" aria-labelledby="${id}">${off}</button></section>`
    }
    case 'range': {
      const value = `<output class="o" for="${id}">${num(start)}</output>`
      if (control.type === 'Step Control') {
        return `${head} data-ui="step"><span class="l">${label}</span>${value}`
          + `<span class="s"><button class="m" type="button" data-d="-1" aria-label="Decrease ${label}">&minus;</button>`
          + `<button class="m" type="button" data-d="1" aria-label="Increase ${label}">+</button></span></section>`
      }
      return `${head}><label class="l" for="${id}">${label}</label>${value}`
        + `<input id="${id}" type="range" min="${num(range.min)}" max="${num(range.max)}" step="${num(range.step)}" value="${num(start)}"></section>`
    }
    case 'choice': {
      const options = webRemoteChoiceOptions(control)
      const buttons = options.map((option, optionIndex) => (
        `<button class="h${optionIndex === start ? ' a' : ''}" type="button" data-o="${optionIndex}">${escapeHtml(option)}</button>`
      )).join('')
      return `${head}><span class="l">${label}</span><span class="g" role="group" aria-label="${label}">${buttons}</span></section>`
    }
    case 'text': {
      // A form, so the phone's own Go/Send key confirms it: the output is
      // the confirmed text, never each keystroke.
      const placeholder = escapeHtml(String(control.properties.placeholder ?? ''))
      return `${head}><label class="l" for="${id}">${label}</label>`
        + `<form class="x"><input id="${id}" type="text" maxlength="${num(range.max)}" value="${escapeHtml(startText)}"`
        + ` placeholder="${placeholder}" enterkeyhint="send" autocomplete="off"><button type="submit">Send</button></form></section>`
    }
    case 'hue': {
      const tone = displayPickerTone(control)
      const stops = webRemoteHueStops(control).join(',')
      return `${head} data-sat="${num(tone.saturation)}" data-bri="${num(tone.brightness)}">`
        + `<label class="l" for="${id}">${label}</label><span class="w" aria-hidden="true"></span>`
        + `<input id="${id}" class="u" type="range" min="0" max="360" step="1" value="${num(start)}"`
        + ` style="background:linear-gradient(90deg,${stops})"></section>`
    }
  }
}

const STYLE = [
  ':root{color-scheme:dark;--bg:#0d1117;--card:#161b22;--line:#30363d;--text:#e6edf3;--dim:#8b949e;--accent:#3fb9ff}',
  '*{box-sizing:border-box}',
  'body{margin:0;background:var(--bg);color:var(--text);font:16px/1.3 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;-webkit-text-size-adjust:100%}',
  'header{position:sticky;top:0;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;background:var(--bg);border-bottom:1px solid var(--line)}',
  'h1{margin:0;font-size:20px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.st{font-size:12px;color:var(--dim);white-space:nowrap}.st.on{color:#56d364}.st.off{color:#f85149}',
  'main{display:flex;flex-direction:column;gap:12px;padding:16px;max-width:560px;margin:0 auto}',
  '.c{display:grid;grid-template-columns:1fr auto;align-items:center;gap:10px;padding:14px;border:1px solid var(--line);border-radius:12px;background:var(--card)}',
  '.l{font-weight:600;overflow-wrap:anywhere}.o{color:var(--dim);font-variant-numeric:tabular-nums}',
  '.c input[type=range]{grid-column:1/-1;width:100%;height:44px;margin:0;accent-color:var(--accent)}',
  'button{min-height:48px;min-width:48px;padding:0 18px;border:1px solid var(--line);border-radius:10px;background:#21262d;color:var(--text);font:inherit;font-weight:600;touch-action:manipulation}',
  '.b{grid-column:1/-1;min-height:64px;user-select:none;-webkit-user-select:none;touch-action:none}',
  '.b.down,.t[aria-pressed=true],.h.a{background:var(--accent);border-color:var(--accent);color:#04121c}',
  '.s{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:10px}.m{font-size:24px}',
  '.g{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:8px}.h{flex:1 1 0}',
  '.u{-webkit-appearance:none;appearance:none;border-radius:22px;outline:none}',
  '.u::-webkit-slider-thumb{-webkit-appearance:none;width:28px;height:40px;border-radius:8px;border:3px solid #fff;background:transparent}',
  '.u::-moz-range-thumb{width:24px;height:36px;border-radius:8px;border:3px solid #fff;background:transparent}',
  '.w{width:32px;height:32px;border-radius:8px;border:1px solid var(--line)}',
  '.x{grid-column:1/-1;display:flex;gap:8px}',
  '.x input{flex:1 1 auto;min-width:0;min-height:48px;padding:0 12px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--text);font:inherit}',
].join('')

/*
 * The page's behaviour. Static text: everything it knows about a control comes
 * from that control's `data-` attributes, which the generator wrote as numbers
 * or escaped words.
 */
const SCRIPT = [
  '(function(){',
  "var E=location.protocol==='about:',st=document.getElementById('st'),",
  "cs=[].slice.call(document.querySelectorAll('.c')),busy={},beat={};",
  'function q(c,x){var lo=+c.dataset.min,hi=+c.dataset.max,s=+c.dataset.step;x=+x;if(!isFinite(x))x=lo;',
  'x=Math.min(hi,Math.max(lo,x));if(s>0)x=lo+Math.round((x-lo)/s)*s;return Math.min(hi,Math.max(lo,Math.round(x*1e6)/1e6));}',
  'function fmt(c,x){return (+x).toFixed(+c.dataset.d);}',
  'function hsv(h,s,v){h=((h%360)+360)%360/60;v=Math.min(1,Math.max(0,v));var k=v*Math.min(1,Math.max(0,s)),',
  'x=k*(1-Math.abs(h%2-1)),i=Math.floor(h),r=[[k,x,0],[x,k,0],[0,k,x],[0,x,k],[x,0,k],[k,0,x]][i]||[k,0,x],m=v-k;',
  "return 'rgb('+r.map(function(n){return Math.round((n+m)*255);}).join(',')+')';}",
  'function show(c,x){c.dataset.v=x;var k=c.dataset.k,el;',
  "if(k==='text'){el=c.querySelector('input');if(document.activeElement!==el)el.value=x;}",
  "else if(k==='press'){el=c.querySelector('button');el.classList.toggle('down',x>=0.5);el.setAttribute('aria-pressed',x>=0.5);}",
  "else if(k==='latch'){el=c.querySelector('button');el.setAttribute('aria-pressed',x>=0.5);el.textContent=x>=0.5?c.dataset.on:c.dataset.off;}",
  "else if(k==='choice'){c.querySelectorAll('.h').forEach(function(b){b.classList.toggle('a',+b.dataset.o===Math.round(x));});}",
  "else{el=c.querySelector('input');if(el)el.value=x;el=c.querySelector('.o');if(el)el.textContent=fmt(c,x);",
  "el=c.querySelector('.w');if(el)el.style.background=hsv(x,+c.dataset.sat,+c.dataset.bri);}}",
  "function live(ok){st.textContent=ok?'live':'offline';st.className='st '+(ok?'on':'off');}",
  'function apply(v){if(!Array.isArray(v))return;live(true);cs.forEach(function(c){var i=+c.dataset.i;',
  "if(!busy[i]&&(typeof v[i]==='number'||typeof v[i]==='string'))show(c,v[i]);});}",
  'function json(r){if(!r.ok)throw 0;return r.json();}',
  "function send(i,v){if(E){parent.postMessage({fls:'wr',op:'set',i:i,v:v},'*');return;}",
  "fetch('/set',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'i='+i+'&v='+encodeURIComponent(v)})",
  '.then(json).then(apply,function(){live(false);});}',
  "function poll(){if(E){parent.postMessage({fls:'wr',op:'get'},'*');return;}",
  "fetch('/s',{cache:'no-store'}).then(json).then(apply,function(){live(false);});}",
  "if(E)addEventListener('message',function(e){if(e.source===parent&&e.data&&e.data.fls==='wr')apply(e.data.v);});",
  // A held button repeats its press so the board can time out a lost release.
  'function down(c,i){if(busy[i])return;busy[i]=1;show(c,1);send(i,1);beat[i]=setInterval(function(){send(i,1);},400);}',
  'function up(c,i){if(!busy[i])return;clearInterval(beat[i]);delete busy[i];show(c,0);send(i,0);}',
  'var last={};function slide(c,i,x){x=q(c,x);show(c,x);var t=Date.now();if(!last[i]||t-last[i]>80){last[i]=t;send(i,x);}}',
  'cs.forEach(function(c){var i=+c.dataset.i,k=c.dataset.k,b=c.querySelector(\'button\'),r=c.querySelector(\'input\');',
  "if(k==='press'){b.addEventListener('pointerdown',function(e){b.setPointerCapture(e.pointerId);down(c,i);});",
  "['pointerup','pointercancel','lostpointercapture'].forEach(function(n){b.addEventListener(n,function(){up(c,i);});});",
  "b.addEventListener('keydown',function(e){if(e.key===' '||e.key==='Enter'){e.preventDefault();down(c,i);}});",
  "b.addEventListener('keyup',function(e){if(e.key===' '||e.key==='Enter')up(c,i);});",
  "b.addEventListener('contextmenu',function(e){e.preventDefault();});}",
  "else if(k==='text'){r.addEventListener('focus',function(){busy[i]=1;});r.addEventListener('blur',function(){delete busy[i];});",
  "c.querySelector('form').addEventListener('submit',function(e){e.preventDefault();show(c,r.value);send(i,r.value);r.blur();});}",
  "else if(k==='latch'){b.addEventListener('click',function(){var x=+c.dataset.v>=0.5?0:1;show(c,x);send(i,x);});}",
  "else if(k==='choice'){c.querySelectorAll('.h').forEach(function(h){h.addEventListener('click',function(){var x=q(c,h.dataset.o);show(c,x);send(i,x);});});}",
  "else if(c.dataset.ui==='step'){c.querySelectorAll('.m').forEach(function(m){m.addEventListener('click',function(){",
  'var x=q(c,+c.dataset.v+(+m.dataset.d)*(+c.dataset.step));show(c,x);send(i,x);});});}',
  "else if(r){r.addEventListener('pointerdown',function(){busy[i]=1;});",
  "r.addEventListener('input',function(){slide(c,i,r.value);});",
  "r.addEventListener('change',function(){var x=q(c,r.value);delete busy[i];last[i]=Date.now();send(i,x);});}",
  "show(c,k==='text'?c.dataset.v:+c.dataset.v);});",
  "document.addEventListener('visibilitychange',function(){if(document.hidden)cs.forEach(function(c){if(c.dataset.k==='press')up(c,+c.dataset.i);});else poll();});",
  'poll();setInterval(poll,1000);',
  '})();',
].join('\n')

/**
 * The whole page for a remote's controls, as the board serves it and the
 * phone preview shows it. Pure: the same controls give the same bytes.
 */
export function webRemotePageHtml(title: unknown, controls: readonly WebRemoteControl[]): string {
  const heading = escapeHtml(webRemoteTitle(title))
  const body = controls.length > 0
    ? controls.map(controlHtml).join('\n')
    : '<p class="o">This remote has no controls yet.</p>'
  return [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">',
    `<title>${heading}</title>`,
    `<style>${STYLE}</style>`,
    '</head><body>',
    `<header><h1>${heading}</h1><span id="st" class="st" role="status">connecting</span></header>`,
    '<main>',
    body,
    '</main>',
    `<script>${SCRIPT}</script>`,
    '</body></html>',
  ].join('\n')
}
