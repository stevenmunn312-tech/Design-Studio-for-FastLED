/** C++ twins of src/state/evaluator/sdf.ts, emitted once when an SDF node is used. */
export const SDF_HELPER_CPP = `// Signed-distance primitives shared by Shape and Shape Field.
static inline float _sdfRect(float x, float y, float halfWidth, float halfHeight) {
  float qx = fabsf(x) - halfWidth, qy = fabsf(y) - halfHeight;
  float mx = fmaxf(qx, 0.0f), my = fmaxf(qy, 0.0f);
  return sqrtf(mx * mx + my * my) + fminf(fmaxf(qx, qy), 0.0f);
}

static inline float _sdfEllipse(float x, float y, float radiusX, float radiusY) {
  float ex = x / radiusX, ey = y / radiusY;
  return (sqrtf(ex * ex + ey * ey) - 1.0f) * fminf(radiusX, radiusY);
}

static inline float _sdfPolygon(float x, float y, float sides, float size) {
  float segment = 6.283185307179586f / sides;
  float angle = atan2f(y, x);
  float folded = fmodf(fmodf(angle, segment) + segment, segment) - segment * 0.5f;
  return sqrtf(x * x + y * y) - size * cosf(3.141592653589793f / sides) / cosf(folded);
}

static inline float _sdfMorphPolygon(float x, float y, float sides, float size) {
  float n = fmaxf(3.0f, sides), lower = floorf(n), amount = n - lower;
  float a = _sdfPolygon(x, y, lower, size);
  if (amount <= 0.0f) return a;
  return a * (1.0f - amount) + _sdfPolygon(x, y, lower + 1.0f, size) * amount;
}`
