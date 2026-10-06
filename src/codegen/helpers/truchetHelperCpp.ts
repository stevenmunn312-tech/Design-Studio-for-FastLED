/** Distance primitives shared by every generated Truchet node. */
export const TRUCHET_HELPER_CPP = String.raw`static inline float _truchetSegmentDistance(float px,float py,float ax,float ay,float bx,float by) {
  float vx=bx-ax,vy=by-ay,wx=px-ax,wy=py-ay,vv=vx*vx+vy*vy;
  float t=vv>0.0f?constrain((wx*vx+wy*vy)/vv,0.0f,1.0f):0.0f;
  float dx=px-(ax+t*vx),dy=py-(ay+t*vy); return sqrtf(dx*dx+dy*dy);
}

static inline float _truchetArcDistance(float x,float y,float cx,float cy,float radius) {
  float dx=x-cx,dy=y-cy; return fabsf(sqrtf(dx*dx+dy*dy)-radius);
}

// Motif ids follow TRUCHET_MOTIFS in evaluator/truchet.ts. The lattice and
// motif are baked constants; only the per-cell orientation changes at runtime.
static inline float _truchetDistance(int lattice,int motif,float x,float y,int orientation) {
  if(lattice==1){
    const float R=0.666666666667f; float d=9999.0f;
    for(int i=0;i<3;i++){float a=(orientation%2+i*2)*1.047197551197f;
      d=min(d,_truchetArcDistance(x,y,R*cosf(a),R*sinf(a),R*0.5f));}
    return d;
  }
  bool flip=(orientation&1)!=0; float sy=flip?-1.0f:1.0f;
  if(motif==4)return fabsf(y-(flip?-x:x))*0.707106781187f;
  if(motif==2){float d=9999.0f;
    for(int ix=0;ix<2;ix++)for(int iy=0;iy<2;iy++)
      d=min(d,_truchetArcDistance(x,y,ix?0.5f:-0.5f,iy?0.5f:-0.5f,0.5f));
    return d;
  }
  if(motif==1)return min(_truchetSegmentDistance(x,y,-0.5f,0.0f,0.0f,0.5f*sy),
                         _truchetSegmentDistance(x,y,0.5f,0.0f,0.0f,-0.5f*sy));
  return min(_truchetArcDistance(x,y,-0.5f,0.5f*sy,0.5f),
             _truchetArcDistance(x,y,0.5f,-0.5f*sy,0.5f));
}

static inline float _truchetLine(float distance,float width) {
  width=constrain(width,0.0f,0.5f);
  if(width<=0.0f)return distance<=0.0000001f?1.0f:0.0f;
  float t=constrain(distance/width,0.0f,1.0f); return 1.0f-t*t*(3.0f-2.0f*t);
}`
