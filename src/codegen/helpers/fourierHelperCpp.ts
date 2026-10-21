import {
  FOURIER_RING_HALF_Q8, FOURIER_RING_LEVEL_8, FOURIER_RING_MIN_Q8, FOURIER_TRAIL_JUMP_A16, FOURIER_TRAIL_STEPS_MAX,
} from '../../nodes/shapes/fourierOutline'

/**
 * Drawing helpers for Fourier Epicycles, the twins of fourierPenQ8 in
 * nodes/shapes/fourierOutline.ts and of the disc, ring and trail step in
 * nodes/shapes/evaluate.ts. All integer: positions and radii in 1/256 pixel,
 * the turn as a 16-bit angle, FastLED's sin16 for the arms and an integer
 * square root for coverage. The byte math is written out rather than left to
 * nscale8 and fadeToBlackBy, so it is FastLED's fixed scale8 whatever the
 * library is configured to do, and the preview can copy it exactly.
 */
export const FOURIER_HELPER_CPP = String.raw`static inline uint8_t _feScale(uint8_t value,uint8_t scale) {
  return (uint8_t)(((uint16_t)value*(uint16_t)(1+scale))>>8);
}

static inline uint32_t _feIsqrt(uint32_t v) {
  uint32_t r=0,b=1UL<<30; while(b>v)b>>=2;
  while(b){ if(v>=r+b){ v-=r+b; r=(r>>1)+b; } else r>>=1; b>>=2; }
  return r;
}

// A soft disc; lighten keeps the brighter channel, otherwise it adds.
static void _feDisc(CRGB* buf,int W,int H,int32_t x,int32_t y,int32_t radius,CRGB color,bool lighten) {
  int x0=max(0,(int)((x-radius-256)>>8)),x1=min(W-1,(int)((x+radius+511)>>8));
  int y0=max(0,(int)((y-radius-256)>>8)),y1=min(H-1,(int)((y+radius+511)>>8));
  for(int py=y0;py<=y1;py++) for(int px=x0;px<=x1;px++){
    int32_t ex=px*256+128-x,ey=py*256+128-y;
    int32_t cov=radius+128-(int32_t)_feIsqrt((uint32_t)(ex*ex)+(uint32_t)(ey*ey));
    if(cov<=0)continue;
    if(cov>256)cov=256;
    uint8_t s=(uint8_t)((cov*255)>>8); CRGB c(_feScale(color.r,s),_feScale(color.g,s),_feScale(color.b,s));
    CRGB& d=buf[py*W+px];
    if(lighten){ if(c.r>d.r)d.r=c.r; if(c.g>d.g)d.g=c.g; if(c.b>d.b)d.b=c.b; } else d+=c;
  }
}

// One guide circle, added at a fraction of the pen colour.
static void _feRing(CRGB* buf,int W,int H,int32_t cx,int32_t cy,int32_t radius,CRGB color) {
  int32_t reach=radius+${FOURIER_RING_HALF_Q8 + 256};
  int x0=max(0,(int)((cx-reach)>>8)),x1=min(W-1,(int)((cx+reach+255)>>8));
  int y0=max(0,(int)((cy-reach)>>8)),y1=min(H-1,(int)((cy+reach+255)>>8));
  for(int py=y0;py<=y1;py++) for(int px=x0;px<=x1;px++){
    int32_t ex=px*256+128-cx,ey=py*256+128-cy;
    int32_t cov=${FOURIER_RING_HALF_Q8 + 128}-abs((int32_t)_feIsqrt((uint32_t)(ex*ex)+(uint32_t)(ey*ey))-radius);
    if(cov<=0)continue;
    if(cov>256)cov=256;
    uint8_t s=(uint8_t)((cov*${FOURIER_RING_LEVEL_8})>>8);
    buf[py*W+px]+=CRGB(_feScale(color.r,s),_feScale(color.g,s),_feScale(color.b,s));
  }
}

// fourierPenQ8's twin over a PROGMEM {frequency, amplitude, phase} word
// table. With a ring buffer it also draws each guide circle before adding
// its arm.
static void _fePen(const uint16_t (*table)[3],int count,int whole,int frac,uint16_t theta,int32_t extent,
                   int32_t cx,int32_t cy,CRGB* rings,int W,int H,CRGB color,int32_t* penX,int32_t* penY) {
  int32_t x=0,y=0;
  for(int k=0;k<count;k++){
    int32_t w=k<whole?256:(k==whole?frac:0); if(w<=0)break;
    int32_t r=(int32_t)(((uint32_t)pgm_read_word(&table[k][1])*(uint32_t)extent)>>16)*w>>8;
    if(rings&&r>=${FOURIER_RING_MIN_Q8})_feRing(rings,W,H,cx+x,cy-y,r,color);
    uint16_t a=(uint16_t)((int32_t)(int16_t)pgm_read_word(&table[k][0])*(int32_t)theta+(int32_t)pgm_read_word(&table[k][2]));
    x+=(r*sin16((uint16_t)(a+16384)))>>15; y+=(r*sin16(a))>>15;
  }
  *penX=cx+x; *penY=cy-y;
}

// Fade the trail, then draw the pen's path since last frame along the
// outline. More than a quarter turn since last frame draws only the new point.
static void _feTrail(CRGB* trail,int W,int H,float persistence,const uint16_t (*table)[3],int count,
                     int whole,int frac,uint16_t turn,int32_t extent,int32_t cx,int32_t cy,int32_t penX,int32_t penY,
                     int32_t radius,CRGB color,uint16_t* lastTurn,int32_t* lastX,int32_t* lastY,bool* has) {
  uint8_t keep=255-(uint8_t)((1.0f-constrain(persistence,0.0f,1.0f))*255.0f);
  for(int i=0;i<W*H;i++){ trail[i].r=_feScale(trail[i].r,keep); trail[i].g=_feScale(trail[i].g,keep); trail[i].b=_feScale(trail[i].b,keep); }
  int32_t delta=(int16_t)(uint16_t)(turn-*lastTurn);
  if(!*has||abs(delta)>${FOURIER_TRAIL_JUMP_A16}){ _feDisc(trail,W,H,penX,penY,radius,color,true); }
  else {
    int32_t dx=abs(penX-*lastX),dy=abs(penY-*lastY);
    int steps=${FOURIER_TRAIL_STEPS_MAX};
    if(dx<32768&&dy<32768) steps=max(1,min(${FOURIER_TRAIL_STEPS_MAX},(int)((_feIsqrt((uint32_t)(dx*dx+dy*dy))*2+255)>>8)));
    for(int i=1;i<=steps;i++){
      int32_t x=penX,y=penY;
      if(i<steps)_fePen(table,count,whole,frac,(uint16_t)(*lastTurn+delta*i/steps),extent,cx,cy,0,W,H,color,&x,&y);
      _feDisc(trail,W,H,x,y,radius,color,true);
    }
  }
  *lastTurn=turn; *lastX=penX; *lastY=penY; *has=true;
}`
