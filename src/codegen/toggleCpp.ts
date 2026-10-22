/** Shared Toggle state machine for normal sketches and template controls. */
export function toggleCpp(id: string, output: string, initial: boolean, trigger: string, on: string, off: string): string[] {
  const active = (value: string) => value !== 'false' && value !== '0'
  const branches = [
    ...(active(off) ? [`if (${off}) ${output} = false;`] : []),
    ...(active(on) ? [`if (${on}) ${output} = true;`] : []),
    ...(active(trigger) ? [`if (_t && !_trP_${id}) ${output} = !${output};`] : []),
  ]
  return [
    `  static bool ${output} = ${initial ? 'true' : 'false'};${active(trigger) ? ` static bool _trP_${id} = false, _trI_${id} = false;` : ''}`,
    // The edge memory starts at the first frame's level, as the preview's does.
    ...(branches.length ? [`  { ${active(trigger) ? `bool _t = (${trigger}); if (!_trI_${id}) { _trP_${id} = _t; _trI_${id} = true; } ` : ''}${branches.join(' else ')}${active(trigger) ? ` _trP_${id} = _t;` : ''} }`] : []),
  ]
}
