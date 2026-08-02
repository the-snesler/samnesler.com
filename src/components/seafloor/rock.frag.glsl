#version 300 es
precision highp float;

#include ./common.glsl

uniform float uTime;
uniform vec2 uFogRange;
uniform vec3 uRockCol;
uniform vec3 uSandCol;
uniform vec3 uCausticCol;
uniform vec3 uFogCol;

in vec3 vWorld;
in vec3 vDir;
flat in float vSeed;
out vec4 fragColor;

void main() {
    // True facet normal from screen-space derivatives — the vertex jitter above means the
    // sphere's own normals are wrong, and flat shading is what sells the low-poly read.
    vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    if (dot(n, vDir) < 0.0) n = -n;

    float lambert = clamp(dot(n, SUN_DIR), 0.0, 1.0);
    vec3 col = uRockCol * (0.4 + 0.95 * lambert);

    // Per-rock tonal variation so a field of them doesn't read as one material.
    col *= 0.8 + 0.4 * fract(vSeed * 0.618);

    // Silt settles on the up-facing faces.
    col = mix(col, uSandCol, smoothstep(0.6, 1.0, n.z) * 0.16);

    col += uCausticCol * caustics(vWorld.xy, uTime) * smoothstep(0.1, 0.8, n.z) * 0.7;

    float fog = fogFactor(vWorld.y, uFogRange);
    fragColor = vec4(mix(col, uFogCol, fog), 1.0 - fog);
}
