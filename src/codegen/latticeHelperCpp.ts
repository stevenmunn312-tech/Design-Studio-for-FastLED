import { LATTICE_HASH_MULTIPLIERS } from '../state/evaluator/lattice'

const [HASH_A, HASH_B, HASH_SEED, HASH_MIX] = LATTICE_HASH_MULTIPLIERS

/** Shared lattice and recursive fan-triangle helpers for generated firmware. */
export const LATTICE_HELPER_CPP = String.raw`struct _LatticeCell { float x, y; int a, b; bool flipped; };
struct _FanFold { float x, y; int sector; };

static inline int _latticeRound(float value) { return (int)floorf(value+0.5f); }

static inline _LatticeCell _squareCell(float x, float y) {
  int a=_latticeRound(x), b=_latticeRound(y);
  _LatticeCell c={x-a,y-b,a,b,false}; return c;
}

static inline _LatticeCell _hexCell(float x, float y) {
  const float R=0.666666666667f, SQRT3=1.732050807569f;
  float q=(0.666666666667f*x)/R, r=(-x/3.0f+SQRT3*y/3.0f)/R;
  float cx=q, cz=r, cy=-q-r;
  int rx=_latticeRound(cx), ry=_latticeRound(cy), rz=_latticeRound(cz);
  float dx=fabsf(rx-cx),dy=fabsf(ry-cy),dz=fabsf(rz-cz);
  if(dx>dy&&dx>dz)rx=-ry-rz; else if(dy>dz)ry=-rx-rz; else rz=-rx-ry;
  float ox=R*1.5f*rx, oy=R*SQRT3*(rz+rx*0.5f);
  _LatticeCell c={x-ox,y-oy,rx,rz,false}; return c;
}

static inline _LatticeCell _triCell(float x, float y) {
  const float SQRT3=1.732050807569f;
  float u=x-y/SQRT3,v=2.0f*y/SQRT3;
  int i=(int)floorf(u),j=(int)floorf(v); float fu=u-i,fv=v-j;
  bool flip=fu+fv>1.0f;
  float cu=i+(flip?0.666666666667f:0.333333333333f);
  float cv=j+(flip?0.666666666667f:0.333333333333f);
  float ox=cu+cv*0.5f,oy=cv*SQRT3*0.5f;
  _LatticeCell c={x-ox,y-oy,i,j,flip}; return c;
}

// latticeHashBits' twin: unsigned 32-bit throughout, top 24 bits kept.
static inline uint32_t _latticeHashBits(int a,int b,uint32_t seed) {
  uint32_t h=(uint32_t)a*${HASH_A}u+(uint32_t)b*${HASH_B}u+seed*${HASH_SEED}u;
  h=(h^(h>>13))*${HASH_MIX}u; h^=h>>16;
  return h>>8;
}

// latticeCellValue's twin, 0.25-1 in exact integer steps, so the float equals
// the preview's. Plain ints rather than the struct, so the .ino prototype hoist
// has no type to trip on.
static inline float _latticeCellValue(int a,int b,bool flipped,uint32_t seed) {
  uint32_t bits=_latticeHashBits(a*2+(flipped?1:0),b,seed);
  return (float)(4194304u+((bits*3u)>>2))/16777216.0f;
}

static inline _FanFold _fanFold(float x,float y,int sides,bool dihedral) {
  int n=max(3,sides); float sectorAngle=6.283185307180f/n;
  float angle=atan2f(y,x); int raw=(int)floorf((angle+sectorAngle*0.5f)/sectorAngle);
  int sector=((raw%n)+n)%n; float folded=angle-raw*sectorAngle;
  if(dihedral&&(sector&1))folded=-folded;
  float radius=sqrtf(x*x+y*y); _FanFold f={radius*cosf(folded),radius*sinf(folded),sector}; return f;
}

static inline void _sliceInverse3(const float c[9],float out[9]) {
  float a=c[0],b=c[1],cc=c[2],d=c[3],e=c[4],f=c[5],g=c[6],h=c[7],i=c[8];
  float A=e*i-f*h,B=cc*h-b*i,C=b*f-cc*e,D=f*g-d*i,E=a*i-cc*g,F=cc*d-a*f;
  float G=d*h-e*g,H=b*g-a*h,I=a*e-b*d,inv=1.0f/(a*A+b*D+cc*G);
  out[0]=A*inv;out[1]=B*inv;out[2]=C*inv;out[3]=D*inv;out[4]=E*inv;
  out[5]=F*inv;out[6]=G*inv;out[7]=H*inv;out[8]=I*inv;
}

static inline void _sliceBuildMatrices(float split,float out[4][9]) {
  float s=constrain(split,0.2f,0.8f);
  // Columns are the three child vertices in parent barycentric coordinates.
  float c0[9]={1,1-s,1-s, 0,s,0, 0,0,s};
  float c1[9]={1-s,0,0, s,1,0.5f, 0,0,0.5f};
  float c2[9]={1-s,0,0, 0,0.5f,0, s,0.5f,1};
  float c3[9]={1-s,0,1-s, s,0.5f,0, 0,0.5f,s};
  _sliceInverse3(c0,out[0]);_sliceInverse3(c1,out[1]);
  _sliceInverse3(c2,out[2]);_sliceInverse3(c3,out[3]);
}

static inline void _sliceMap(const float m[9],const float in[3],float out[3]) {
  out[0]=m[0]*in[0]+m[1]*in[1]+m[2]*in[2];
  out[1]=m[3]*in[0]+m[4]*in[1]+m[5]*in[2];
  out[2]=m[6]*in[0]+m[7]*in[1]+m[8]*in[2];
}

static inline int _sliceWalk(float lambda[3],int depth,const float matrices[4][9]) {
  int leaf=0;
  for(int level=0;level<depth;level++){
    int child=3;float next[3];_sliceMap(matrices[3],lambda,next);
    for(int candidate=0;candidate<3;candidate++){
      float mapped[3];_sliceMap(matrices[candidate],lambda,mapped);
      if(mapped[0]>=-0.0000001f&&mapped[1]>=-0.0000001f&&mapped[2]>=-0.0000001f){
        child=candidate;next[0]=mapped[0];next[1]=mapped[1];next[2]=mapped[2];break;
      }
    }
    leaf=leaf*4+child;lambda[0]=next[0];lambda[1]=next[1];lambda[2]=next[2];
  }
  return leaf;
}

static inline uint8_t _sliceBit(const uint8_t *bits,int leaf){return (bits[leaf>>3]>>(leaf&7))&1u;}
static inline float _sliceEdge(float value,float edge){
  if(edge<=0.0f)return value>=0.0f?1.0f:0.0f;
  float t=constrain(value/edge,0.0f,1.0f);return t*t*(3.0f-2.0f*t);
}`

/**
 * `worleyHash`'s twin, which is the lattice hash, seed included, emitted on
 * its own behind `needsWorley` so Worley noise does not pull in the lattice
 * helper. Callers without a seed pass `0u`. Casting before multiplying keeps
 * the arithmetic unsigned; `(uint32_t)(x * 374761393)` overflowed a signed int
 * first, which is undefined behaviour. The show generator hoists it by the
 * signature line through the closing brace.
 */
export const WORLEY_HASH_CPP = [
  '// Integer hash → [0,1) placing one feature point per cell (Worley noise):',
  '// unsigned 32-bit with the top 24 bits kept, so the float equals the preview\'s.',
  'float _worleyHash(int x, int y, uint32_t seed) {',
  `  uint32_t h = (uint32_t)x * ${HASH_A}u + (uint32_t)y * ${HASH_B}u + seed * ${HASH_SEED}u;`,
  `  h = (h ^ (h >> 13)) * ${HASH_MIX}u;`,
  '  return (float)((h ^ (h >> 16)) >> 8) / 16777216.0f;',
  '}',
].join('\n')
