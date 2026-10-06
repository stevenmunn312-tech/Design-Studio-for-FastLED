import {
  FOURIER_RING_HALF_WIDTH, FOURIER_RING_LEVEL, FOURIER_RING_MIN_RADIUS, FOURIER_TRAIL_JUMP,
  FOURIER_TRAIL_STEPS_MAX,
} from '../../nodes/shapes/fourierOutline'
import { floatLit } from '../cppLiterals'

/**
 * Drawing helpers for Fourier Epicycles, the twins of fourierPen in
 * nodes/shapes/fourierOutline.ts and of fourierDisc, fourierRing and the trail step
 * in nodes/shapes/evaluate.ts. The byte math is written out rather than left
 * to nscale8 and fadeToBlackBy, so it is FastLED's fixed scale8 whatever the
 * library is configured to do, and the preview can copy it exactly.
 */
export const FOURIER_HELPER_CPP = String.raw`static inline uint8_t _feScale(uint8_t value,uint8_t scale) {
  return (uint8_t)(((uint16_t)value*(uint16_t)(1+scale))>>8);
}

// A soft disc; lighten keeps the brighter channel, otherwise it adds.
static void _feDisc(CRGB* buf,int W,int H,float x,float y,float radius,CRGB color,bool lighten) {
  int x0=max(0,(int)floorf(x-radius-1.0f)),x1=min(W-1,(int)ceilf(x+radius+1.0f));
  int y0=max(0,(int)floorf(y-radius-1.0f)),y1=min(H-1,(int)ceilf(y+radius+1.0f));
  for(int py=y0;py<=y1;py++) for(int px=x0;px<=x1;px++){
    float dx=(px+0.5f)-x,dy=(py+0.5f)-y,cov=constrain(radius+0.5f-sqrtf(dx*dx+dy*dy),0.0f,1.0f);
    if(cov<=0.0f)continue;
    uint8_t s=(uint8_t)(cov*255.0f); CRGB c(_feScale(color.r,s),_feScale(color.g,s),_feScale(color.b,s));
    CRGB& d=buf[py*W+px];
    if(lighten){ if(c.r>d.r)d.r=c.r; if(c.g>d.g)d.g=c.g; if(c.b>d.b)d.b=c.b; } else d+=c;
  }
}

// One guide circle, added at a fraction of the pen colour.
static void _feRing(CRGB* buf,int W,int H,float cx,float cy,float radius,CRGB color) {
  float reach=radius+${floatLit(FOURIER_RING_HALF_WIDTH)}+1.0f;
  int x0=max(0,(int)floorf(cx-reach)),x1=min(W-1,(int)ceilf(cx+reach));
  int y0=max(0,(int)floorf(cy-reach)),y1=min(H-1,(int)ceilf(cy+reach));
  for(int py=y0;py<=y1;py++) for(int px=x0;px<=x1;px++){
    float dx=(px+0.5f)-cx,dy=(py+0.5f)-cy;
    float cov=constrain(${floatLit(FOURIER_RING_HALF_WIDTH + 0.5)}-fabsf(sqrtf(dx*dx+dy*dy)-radius),0.0f,1.0f);
    if(cov<=0.0f)continue;
    uint8_t s=(uint8_t)(cov*${floatLit(FOURIER_RING_LEVEL)}*255.0f);
    buf[py*W+px]+=CRGB(_feScale(color.r,s),_feScale(color.g,s),_feScale(color.b,s));
  }
}

// fourierPen's twin over a PROGMEM {frequency, amplitude, phase} table. With
// a ring buffer it also draws each guide circle before adding its arm.
static void _fePen(const float (*table)[3],int count,float harmonics,float turn,float extent,
                   float cx,float cy,CRGB* rings,int W,int H,CRGB color,float* penX,float* penY) {
  float h=constrain(harmonics,1.0f,(float)count),theta=turn*6.283185307180f,x=0.0f,y=0.0f;
  int whole=(int)floorf(h);
  for(int k=0;k<count;k++){
    float w=k<whole?1.0f:(k==whole?h-whole:0.0f); if(w<=0.0f)break;
    float r=pgm_read_float(&table[k][1])*w*extent;
    if(rings&&r>=${floatLit(FOURIER_RING_MIN_RADIUS)})_feRing(rings,W,H,cx+x,cy-y,r,color);
    float a=pgm_read_float(&table[k][0])*theta+pgm_read_float(&table[k][2]);
    x+=r*cosf(a); y+=r*sinf(a);
  }
  *penX=cx+x; *penY=cy-y;
}

// Fade the trail, then draw the pen's path since last frame along the
// outline. More than a quarter turn since last frame draws only the new point.
static void _feTrail(CRGB* trail,int W,int H,float persistence,const float (*table)[3],int count,
                     float harmonics,float turn,float extent,float cx,float cy,float penX,float penY,
                     float radius,CRGB color,float* lastTurn,float* lastX,float* lastY,bool* has) {
  uint8_t keep=255-(uint8_t)((1.0f-constrain(persistence,0.0f,1.0f))*255.0f);
  for(int i=0;i<W*H;i++){ trail[i].r=_feScale(trail[i].r,keep); trail[i].g=_feScale(trail[i].g,keep); trail[i].b=_feScale(trail[i].b,keep); }
  float delta=turn-*lastTurn; delta-=floorf(delta+0.5f);
  if(!*has||fabsf(delta)>${floatLit(FOURIER_TRAIL_JUMP)}){ _feDisc(trail,W,H,penX,penY,radius,color,true); }
  else {
    float dx=penX-*lastX,dy=penY-*lastY;
    int steps=max(1,min(${FOURIER_TRAIL_STEPS_MAX},(int)ceilf(sqrtf(dx*dx+dy*dy)*2.0f)));
    for(int i=1;i<=steps;i++){
      float x=penX,y=penY;
      if(i<steps)_fePen(table,count,harmonics,*lastTurn+delta*i/steps,extent,cx,cy,0,W,H,color,&x,&y);
      _feDisc(trail,W,H,x,y,radius,color,true);
    }
  }
  *lastTurn=turn; *lastX=penX; *lastY=penY; *has=true;
}`
