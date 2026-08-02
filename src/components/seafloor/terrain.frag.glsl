#version 300 es
precision highp float;

#include ./common.glsl

uniform float uTime;
uniform vec2 uFogRange;
uniform vec3 uSandCol;
uniform vec3 uSandDeepCol;
uniform vec3 uCausticCol;
uniform vec3 uFogCol;
uniform float uAmplitude;

in vec3 vWorld;
in vec3 vNormal;
out vec4 fragColor;

void main() {
    vec3 n = normalize(vNormal);
    vec2 wp = vWorld.xy;

    // Detail is faded out with distance: at a quarter-resolution canvas the high frequencies
    // alias into static long before the fog would have hidden them.
    float detailFade = 1.0 - smoothstep(-1.0, 9.0, vWorld.y);

    // Crevices keep the deep tone, exposed ridges bleach toward the light sand.
    float exposure = clamp(vWorld.z / max(uAmplitude * 1.1, 0.001) * 0.5 + 0.5, 0.0, 1.0);
    float lambert = clamp(dot(n, SUN_DIR), 0.0, 1.0);
    float shade = exposure * 0.5 + lambert * 0.5;

    // Surface texture, coarse to fine: silt patches, then sand ripples that meander with the
    // patches, then per-grain speckle. The ripples carry most of the "this is a seabed" read,
    // so they get the largest share and the others only break them up.
    float patches = fbm(wp * 0.5, 3);
    float grain = fbm(wp * 2.6, 2);
    float ripple = sin((wp.x * 1.1 + wp.y * 0.55) * 3.2 + patches * 3.5) * 0.5 + 0.5;

    shade += (patches - 0.5) * 0.20;
    shade += (grain - 0.5) * 0.16 * detailFade;
    shade += (ripple - 0.5) * 0.46 * smoothstep(0.4, 0.95, n.z) * detailFade;

    // Posterise. The banding is the point: it turns a smooth gradient into readable contour
    // steps, which is what makes the dunes legible once the canvas is upscaled 4x.
    shade = floor(clamp(shade, 0.0, 1.0) * 6.0 + 0.5) / 6.0;

    vec3 col = mix(uSandDeepCol, uSandCol, shade) * (0.8 + 0.28 * lambert);

    // Caustics ride the surface, but only where the floor actually faces upward.
    float caust = caustics(wp, uTime) * smoothstep(0.2, 0.8, n.z);
    col += uCausticCol * caust * 0.62;

    float fog = fogFactor(vWorld.y, uFogRange);
    fragColor = vec4(mix(col, uFogCol, fog), 1.0 - fog);
}
