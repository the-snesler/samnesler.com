#version 300 es
in vec3 position;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

in vec3 aOffset;
in vec3 aScale;
in float aSeed;

out vec3 vWorld;
out vec3 vDir;
flat out float vSeed;

// GPU-only jitter — nothing on the CPU needs to reproduce it, so a cheap sin hash is fine.
float hash13(vec3 p) {
    return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
}

void main() {
    // OGL's Sphere is Y-up; this scene is Z-up.
    vec3 unit = normalize(vec3(position.x, position.z, position.y));

    // Push each vertex in or out along its own direction to break the sphere into a boulder.
    // Quantising the direction first keeps neighbouring vertices on the same facet; keep the
    // amplitude modest or the ellipsoid collapses into a wedge.
    vec3 cell = floor(unit * 1.8 + 0.5);
    float bump = 0.82 + 0.28 * hash13(cell + aSeed) + 0.12 * hash13(unit * 5.0 + aSeed * 3.0);

    vec3 world = aOffset + unit * bump * aScale;
    vWorld = world;
    vDir = unit;
    vSeed = aSeed;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
}
