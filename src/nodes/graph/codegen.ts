import type { NodeEmitters } from '../../codegen/emitContext'

export const GRAPH_EMITTERS: NodeEmitters = {
  // A role-tagged group input kept by buildPattern (collection-show codegen)
  // resolves to the matching render_pN parameter. Float roles (energy/speed)
  // become `float n_<id>_out = <role>;`; the palette role copies the param
  // into `pal_<id>` so paletteExpr can reference it. Normal graphs flatten
  // GroupInputs away via flattenGroups, so this case is only reached for the
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
}
