/**
 * One Conway Life generation as the sketch steps it: the C++ twin of
 * `stepLife` (state/evaluator/automaton.ts), shared by the Game of Life
 * pattern and Automaton's life type so the two cannot drift apart.
 *
 * Steps `c` into `nx` on a torus, copies `c` to `pv` and `nx` back to `c`, then
 * counts `st` up while the board is empty, frozen or back where it was two
 * generations ago, and clears it otherwise. The caller reseeds past its limit.
 */
export function lifeGenerationCpp(c: string, nx: string, pv: string, st: string): string[] {
  return [
    `      int _pop=0; bool _chg=false, _chg2=false;`,
    `      for (int _y=0;_y<HEIGHT;_y++){ int _ym=((_y-1+HEIGHT)%HEIGHT)*WIDTH,_yp=((_y+1)%HEIGHT)*WIDTH,_yr=_y*WIDTH;`,
    `        for (int _x=0;_x<WIDTH;_x++){ int _xm=(_x-1+WIDTH)%WIDTH,_xp=(_x+1)%WIDTH,_i=_yr+_x;`,
    `          int _n=${c}[_ym+_xm]+${c}[_ym+_x]+${c}[_ym+_xp]+${c}[_yr+_xm]+${c}[_yr+_xp]+${c}[_yp+_xm]+${c}[_yp+_x]+${c}[_yp+_xp];`,
    `          ${nx}[_i]=${c}[_i]?((_n==2||_n==3)?1:0):(_n==3?1:0); _pop+=${nx}[_i]; if(${nx}[_i]!=${c}[_i]) _chg=true; if(${nx}[_i]!=${pv}[_i]) _chg2=true; } }`,
    `      ::memcpy(${pv},${c},sizeof(${c})); ::memcpy(${c},${nx},sizeof(${c}));`,
    `      ${st}=(_pop==0||!_chg||!_chg2)?${st}+1:0;`,
  ]
}
