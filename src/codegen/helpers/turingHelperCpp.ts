import { TURING_DEAD_ZONE, TURING_FLAT_RANGE } from '../../state/evaluator/turing'
import { floatLit } from '../cppLiterals'

/**
 * turingStep's twin from evaluator/turing.ts: one McCabe multi-scale iteration
 * over a toroidal summed-area table. Width and height are parameters so the
 * helper does not depend on which canvas macros a sketch defines.
 */
export const TURING_HELPER_CPP = String.raw`// Periodic prefix sum over [0,X)x[0,Y). Radii stay below half the canvas, so a
// box wraps at most once per side.
static inline float _turingPeriodicSum(const float* P,int W,int H,int X,int Y) {
  int S=W+1,qx=X<0?-1:(X>=W?1:0),qy=Y<0?-1:(Y>=H?1:0),rx=X-qx*W,ry=Y-qy*H;
  return (float)(qx*qy)*P[H*S+W]+(float)qx*P[ry*S+W]+(float)qy*P[H*S+rx]+P[ry*S+rx];
}

static inline float _turingBox(const float* P,int W,int H,int x,int y,int rx,int ry) {
  float sum=_turingPeriodicSum(P,W,H,x+rx+1,y+ry+1)-_turingPeriodicSum(P,W,H,x-rx,y+ry+1)
           -_turingPeriodicSum(P,W,H,x+rx+1,y-ry)+_turingPeriodicSum(P,W,H,x-rx,y-ry);
  return sum/(float)((2*rx+1)*(2*ry+1));
}

static void _turingStep(float* a,float* P,int W,int H,const int* radii,int scales,float stepSize) {
  int S=W+1,N=W*H; float mean=0.0f;
  for(int i=0;i<N;i++)mean+=a[i];
  mean/=(float)N;
  for(int x=0;x<=W;x++)P[x]=0.0f;
  for(int y=0;y<H;y++){ float row=0.0f; P[(y+1)*S]=0.0f;
    for(int x=0;x<W;x++){ row+=a[y*W+x]-mean; P[(y+1)*S+x+1]=P[y*S+x+1]+row; } }
  int maxRx=(W-1)>>1,maxRy=(H-1)>>1; float lo=1e30f,hi=-1e30f;
  for(int y=0;y<H;y++) for(int x=0;x<W;x++){
    float best=1e30f,delta=0.0f;
    for(int k=0;k<scales;k++){
      int r=radii[k],arx=min(r,maxRx),ary=min(r,maxRy),irx=min(2*r,maxRx),iry=min(2*r,maxRy);
      if(arx==irx&&ary==iry)continue;
      float d=_turingBox(P,W,H,x,y,arx,ary)-_turingBox(P,W,H,x,y,irx,iry),v=fabsf(d);
      if(v<best){ best=v; float amount=stepSize*(float)(k+1)/(float)scales;
        delta=d>${floatLit(TURING_DEAD_ZONE, 7)}?amount:(d<-${floatLit(TURING_DEAD_ZONE, 7)}?-amount:0.0f); }
    }
    int i=y*W+x; a[i]+=delta; if(a[i]<lo)lo=a[i]; if(a[i]>hi)hi=a[i];
  }
  float range=hi-lo;
  // (a-mid)*scale rather than (a-lo)*scale-1: no multiply-add to fuse.
  if(range>${floatLit(TURING_FLAT_RANGE, 7)}){ float scale=2.0f/range,mid=lo+range*0.5f; for(int i=0;i<N;i++)a[i]=(a[i]-mid)*scale; }
}`
