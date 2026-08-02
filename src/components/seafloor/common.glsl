// Shared seafloor lighting. Z is up, +Y is forward (see SeafloorEffect's camera).
// Block comments are avoided on purpose: vite-plugin-glsl's include scanner mangles them.

#define SUN_DIR normalize(vec3(0.28, -0.35, 1.0))

// Decorative noise. Purely GPU-side — unlike terrain.ts's heightfield nothing on the CPU has
// to reproduce these values, so a float hash is fine here.
float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p, int octaves) {
    float amp = 0.5;
    float sum = 0.0;
    float norm = 0.0;
    for (int i = 0; i < octaves; i++) {
        sum += amp * vnoise(p);
        norm += amp;
        p *= 2.03;
        amp *= 0.5;
    }
    return sum / norm;
}

// Animated caustics: three drifting sine lattices folded around zero so the near-zero
// crossings become thin bright filaments. Sampled in world XY so the floor, the rocks and
// the flora all sit under the same moving light.
float caustics(vec2 worldXY, float t) {
    vec2 uv = worldXY * 0.5;
    float acc = 0.0;
    for (int i = 0; i < 3; i++) {
        float fi = float(i);
        vec2 q = uv + vec2(sin(t * 0.31 + fi * 1.7), cos(t * 0.24 + fi * 2.3)) * 0.75;
        acc += sin(q.x * 1.63 + t * 0.44 + fi) + sin(q.y * 1.91 - t * 0.37 + fi * 2.0) + sin((q.x + q.y) * 1.27 + t * 0.28 + fi * 0.6);
    }
    float ridge = 1.0 - abs(acc) * 0.25;
    return pow(clamp(ridge, 0.0, 1.0), 5.0);
}

// Distance haze. 0 at the camera, 1 past the far plane. Callers mix colour toward the fog
// tint AND drop alpha by the same amount, so the far edge of the terrain dissolves into the
// page background instead of ending on a hard line.
float fogFactor(float worldY, vec2 range) {
    return clamp((worldY - range.x) / max(range.y - range.x, 0.001), 0.0, 1.0);
}
