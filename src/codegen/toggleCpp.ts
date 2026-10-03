/** Shared Toggle state machine for normal sketches and template controls. */
export function toggleCpp(id: string, output: string, initial: boolean, trigger: string, on: string, off: string): string[] {
  return [
    `  static bool ${output} = ${initial ? 'true' : 'false'}; static bool _trP_${id} = false;`,
    `  { bool _t = (${trigger}); if (${off}) ${output} = false; else if (${on}) ${output} = true; else if (_t && !_trP_${id}) ${output} = !${output}; _trP_${id} = _t; }`,
  ]
}
