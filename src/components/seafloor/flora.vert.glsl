#version 300 es
in vec3 position;
in vec2 uv;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float uTime;
uniform float uSwaySpeed;
uniform float uSwayAmount;

in vec3 aOffset;
in vec2 aScale;
in float aPhase;
in float aFrame;
in float aTiles;

out vec2 vUv;
out vec3 vWorld;
out float vHeight;
flat out vec2 vFrameTiles;

void main() {
    // Local quad: x in [-0.5, 0.5], z in [0, 1]. The camera is fixed and looks straight down
    // +Y, so "face the camera" is just the XZ plane — no billboard matrix needed.
    float h = position.z;

    // Bend, don't translate: sway scales with h^1.6 so the root stays planted and the tip
    // travels furthest. The world position feeds the phase so neighbours drift apart.
    float t = uTime * uSwaySpeed + aPhase + aOffset.x * 0.31 + aOffset.y * 0.17;
    float bend = (sin(t) * 0.75 + sin(t * 2.37 + 1.1) * 0.25) * uSwayAmount * pow(h, 1.6);

    vec3 world = vec3(
        aOffset.x + position.x * aScale.x + bend * aScale.y,
        aOffset.y + bend * aScale.y * 0.2,
        aOffset.z + h * aScale.y
    );

    vUv = uv;
    vWorld = world;
    vFrameTiles = vec2(aFrame, aTiles);
    vHeight = h;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
}
