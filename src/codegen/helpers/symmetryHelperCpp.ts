// Shared wallpaper-group fold for Field Symmetry and Symmetry. Group ids are
// the append-only WALLPAPER_GROUPS order in state/evaluator/symmetry.ts.
export const SYMMETRY_HELPER_CPP = String.raw`static inline void _wallpaperCyclicFold(float x,float y,int rotations,bool mirror,float &outX,float &outY) {
  float sector=6.283185307180f/rotations,radius=sqrtf(x*x+y*y),angle=atan2f(y,x);
  angle-=floorf((angle+sector*0.5f)/sector)*sector;
  if(mirror)angle=fabsf(angle);
  outX=radius*cosf(angle);outY=radius*sinf(angle);
}

static inline void _foldWallpaper(float x,float y,uint8_t group,float &outX,float &outY) {
  switch(group){
    case 1:_wallpaperCyclicFold(x,y,2,false,outX,outY);break;
    case 2:outX=fabsf(x);outY=y;break;
    case 3:outX=fabsf(x);outY=fabsf(y);break;
    case 4:_wallpaperCyclicFold(x,y,4,false,outX,outY);break;
    case 5:_wallpaperCyclicFold(x,y,4,true,outX,outY);break;
    case 6:_wallpaperCyclicFold(x,y,3,false,outX,outY);break;
    case 7:_wallpaperCyclicFold(x,y,6,false,outX,outY);break;
    case 8:_wallpaperCyclicFold(x,y,6,true,outX,outY);break;
    default:outX=x;outY=y;break;
  }
}`
