import type { NodeEmitters } from '../../codegen/emitContext'
import { boardLinkPropertiesOf } from '../../build/boardLinks'
import { boardLinkDateTimeCpp, boardLinkValueExpr, linkedClockSymbol } from '../../codegen/peripherals/espNowLinkCpp'

export const GRAPH_EMITTERS: NodeEmitters = {
  // A role-tagged group input kept by buildPattern (collection-show codegen)
  // resolves to the matching render_pN parameter. Float roles (energy/speed)
  // become `float n_<id>_out = <role>;`; the palette role copies the param
  // into `pal_<id>` so paletteExpr can reference it. Normal graphs flatten
  // GroupInputs away via expandGroups, so this case is only reached for the
  // patterns the show player drives.
  GroupInput({ node, id, p, ln, v, opts }) {
    const role = String(p.paramId ?? 'energy')
    const outputType = ((node.data.outputs as { dataType?: string }[] | undefined)?.[0]?.dataType ?? '')
    if (outputType === 'audio') ln(`  // Audio GroupInput — its cable selects the host audio globals used downstream.`)
    else if (role === 'palette') ln(`  CRGBPalette16 pal_${id} = palette;`)
    else ln(`  float ${v('out')} = ${opts.groupInputExprs?.[role] ?? role};`)
  },
  Comment() {
    // Canvas-only annotation — no ports, nothing to emit.
  },
  /*
   * A value another board sends over the board link (docs/design/board-links.md).
   * The frame was applied before the graph, so this pass reads it like any
   * other source. A display carries no value of its own: the panel it feeds
   * reads the fields straight off the link, and only a clock is declared, as
   * the struct an RTC would have written.
   */
  BoardLinkIn({ node, ln, v, boardLink }) {
    const props = boardLinkPropertiesOf(node)
    if (!props || !boardLink) return
    if (props.dataType === 'display') {
      const field = props.fields?.[0]
      if (props.displayKind === 'clock' && field) {
        for (const line of boardLinkDateTimeCpp(boardLink, props, linkedClockSymbol(node.id), field.index)) ln(line)
      }
      return
    }
    if (props.dataType === 'datetime') {
      for (const line of boardLinkDateTimeCpp(boardLink, props, v('value'))) ln(line)
      return
    }
    const expr = boardLinkValueExpr(boardLink, props)
    const rest = props.dataType === 'bool' ? 'false' : props.dataType === 'color' ? 'CRGB::Black' : props.dataType === 'string' ? '""' : '0.0f'
    const type = props.dataType === 'bool' ? 'bool' : props.dataType === 'color' ? 'CRGB' : props.dataType === 'string' ? 'const char *' : 'float'
    ln(`  ${type} ${v('value')} = ${expr ?? rest};  // from board ${boardLink.context.boardOrder.indexOf(props.senderBoardId) + 1} over the link`)
  },
  // A sink: what it sends is staged after the graph, from the wire into it.
  BoardLinkOut() {},
}
