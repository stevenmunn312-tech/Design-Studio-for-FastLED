import { cppCode, pruneCpp } from './cppReachability'

/** Drop unread port locals. Calls with unknown effects still execute; only
 * expressions without calls and established read-only getters disappear. */
export function withoutUnreadPorts(source: string): string {
  for (;;) {
    const code = cppCode(source)
    const counts = new Map<string, number>()
    for (const name of code.match(/\bn_[A-Za-z0-9_]+\b/g) ?? []) counts.set(name, (counts.get(name) ?? 0) + 1)
    const declarations = [...code.matchAll(/\b(?:static\s+)?(?:float|bool|int|uint(?:8|16|32)_t|CRGB|const char\s*\*)\s+(n_\w+)\s*=\s*([^;{}]+);/g)]
    let changed = false
    for (const match of declarations.reverse()) {
      if (counts.get(match[1]) !== 1) continue
      const calls = [...match[2].matchAll(/\b([\w:]+)\s*\(/g)].map((call) => call[1])
      const pure = !/\+\+|--|(?<![=!<>])=(?!=)/.test(match[2]) && calls.every((name) => /^(?:constrain|min|max|fminf|fmaxf|fabsf|floorf|ceilf|roundf|lroundf|sinf|cosf|sqrtf|powf|CRGB|CHSV|float|int|bool|lv_\w+_get_\w+)$/.test(name))
      if (!pure && match[0].startsWith('static ')) continue
      const replacement = pure ? '' : `(void)(${source.slice(match.index! + match[0].indexOf('=') + 1, match.index! + match[0].length - 1).trim()});`
      source = source.slice(0, match.index!) + replacement + source.slice(match.index! + match[0].length)
      changed = true
    }
    if (!changed) return source
  }
}

export function finishCpp(source: string): string {
  source = pruneCpp(withoutUnreadPorts(source))
  // This header belongs to the NTP path, not to every network consumer.
  if (!/\b(?:configTime|configTzTime|time_t|tm|gmtime|localtime|mktime|time)\b/.test(cppCode(source.replace(/#include <time.h>/g, '')))) {
    source = source.replace(/^#include <time.h>\r?\n/gm, '')
  }
  return source
}
