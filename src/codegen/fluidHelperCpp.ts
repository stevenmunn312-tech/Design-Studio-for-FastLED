import { FLUID_DYE_MAX, FLUID_VMAX } from '../state/evaluator/fluid'
import { floatLit } from './cppLiterals'

/**
 * fluidStep's twin from evaluator/fluid.ts: Stam's stable fluids on a periodic
 * canvas. Width and height are parameters so the helper does not depend on
 * which canvas macros a sketch defines. The node emitter adds the sources
 * (injection, puff, force fields, buoyancy) inline before calling this.
 */
export const FLUID_HELPER_CPP = String.raw`static void _fluidSolve(float* x,const float* x0,int W,int H,float a,float c,int iters) {
  for(int it=0;it<iters;it++) for(int y=0;y<H;y++){ int up=((y-1+H)%H)*W,dn=((y+1)%H)*W,row=y*W;
    for(int xx=0;xx<W;xx++){ int l=(xx-1+W)%W,r=(xx+1)%W; x[row+xx]=(x0[row+xx]+a*(x[row+l]+x[row+r]+x[up+xx]+x[dn+xx]))/c; } }
}

static void _fluidProject(float* u,float* v,float* p,float* div,int W,int H,int iters) {
  for(int y=0;y<H;y++){ int up=((y-1+H)%H)*W,dn=((y+1)%H)*W,row=y*W;
    for(int x=0;x<W;x++){ int l=(x-1+W)%W,r=(x+1)%W; div[row+x]=-0.5f*(u[row+r]-u[row+l]+v[dn+x]-v[up+x]); p[row+x]=0.0f; } }
  _fluidSolve(p,div,W,H,1.0f,4.0f,iters);
  for(int y=0;y<H;y++){ int up=((y-1+H)%H)*W,dn=((y+1)%H)*W,row=y*W;
    for(int x=0;x<W;x++){ int l=(x-1+W)%W,r=(x+1)%W; u[row+x]-=0.5f*(p[row+r]-p[row+l]); v[row+x]-=0.5f*(p[dn+x]-p[up+x]); } }
}

static void _fluidAdvect(float* dst,const float* src,const float* u,const float* v,int W,int H) {
  for(int y=0;y<H;y++) for(int x=0;x<W;x++){ int i=y*W+x;
    float px=x-u[i],py=y-v[i]; px-=floorf(px/W)*W; py-=floorf(py/H)*H;
    int x0=min(W-1,(int)floorf(px)),y0=min(H-1,(int)floorf(py)); float sx=px-x0,sy=py-y0; int x1=(x0+1)%W,y1=(y0+1)%H;
    dst[i]=(1.0f-sx)*((1.0f-sy)*src[y0*W+x0]+sy*src[y1*W+x0])+sx*((1.0f-sy)*src[y0*W+x1]+sy*src[y1*W+x1]); }
}

static void _fluidStep(float* u,float* v,float* u0,float* v0,float* d,float* d0,int W,int H,int iters,float visc,float diff,float diss) {
  int n=W*H; visc=constrain(visc,0.0f,1.0f); diff=constrain(diff,0.0f,1.0f); float keep=1.0f-constrain(diss,0.0f,1.0f);
  if(visc>0.0f){ ::memcpy(u0,u,n*sizeof(float)); ::memcpy(v0,v,n*sizeof(float));
    _fluidSolve(u,u0,W,H,visc,1.0f+4.0f*visc,iters); _fluidSolve(v,v0,W,H,visc,1.0f+4.0f*visc,iters); }
  _fluidProject(u,v,u0,v0,W,H,iters);
  ::memcpy(u0,u,n*sizeof(float)); ::memcpy(v0,v,n*sizeof(float));
  _fluidAdvect(u,u0,u0,v0,W,H); _fluidAdvect(v,v0,u0,v0,W,H);
  _fluidProject(u,v,u0,v0,W,H,iters);
  for(int i=0;i<n;i++){ u[i]=constrain(u[i],-${floatLit(FLUID_VMAX)},${floatLit(FLUID_VMAX)}); v[i]=constrain(v[i],-${floatLit(FLUID_VMAX)},${floatLit(FLUID_VMAX)}); }
  if(diff>0.0f){ ::memcpy(d0,d,n*sizeof(float)); _fluidSolve(d,d0,W,H,diff,1.0f+4.0f*diff,iters); }
  ::memcpy(d0,d,n*sizeof(float));
  _fluidAdvect(d,d0,u,v,W,H);
  for(int i=0;i<n;i++) d[i]=fminf(${floatLit(FLUID_DYE_MAX)},d[i]*keep);
}`
