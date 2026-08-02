#version 300 es
precision highp float;

#include ./common.glsl

uniform sampler2D uTex;
uniform float uTime;
uniform float uFrameCount;
uniform float uFrameRate;
uniform vec2 uFogRange;
uniform vec3 uFloraCol;
uniform vec3 uFloraTipCol;
uniform vec3 uCausticCol;
uniform vec3 uFogCol;

in vec2 vUv;
in vec3 vWorld;
in float vHeight;
flat in vec2 vFrameTiles;
out vec4 fragColor;

void main() {
    // Vertical strip atlas, texture v = 0 is the top of the image (flipY is off).
    // Kelp tiles its single-block frame vFrameTiles.y times up the quad.
    float frame = floor(mod(uTime * uFrameRate + vFrameTiles.x, uFrameCount));
    float local = fract((1.0 - vHeight) * vFrameTiles.y);
    vec4 texel = texture(uTex, vec2(vUv.x, (frame + local) / uFrameCount));

    // Cutout rather than blend, so flora needs no depth sorting against itself or the rocks.
    if (texel.a < 0.5) discard;

    // The source atlases are Minecraft greens; only their luminance structure is kept. Their
    // opaque texels span ~0.24-0.52 luma, so the ramp is fitted to that, not to 0-1.
    float lum = dot(texel.rgb, vec3(0.299, 0.587, 0.114));
    vec3 col = mix(uFloraCol, uFloraTipCol, smoothstep(0.23, 0.53, lum));

    // Ambient occlusion toward the root, and tips catch more of the surface light. Flora is
    // kept darker than the haze on purpose: the plants read as silhouettes, and the caustics
    // are the only thing that lifts them.
    col *= 0.55 + 0.45 * smoothstep(0.0, 0.7, vHeight);
    col += uCausticCol * caustics(vWorld.xy, uTime) * (0.05 + 0.3 * vHeight);

    float fog = fogFactor(vWorld.y, uFogRange);
    fragColor = vec4(mix(col, uFogCol, fog), 1.0 - fog);
}
