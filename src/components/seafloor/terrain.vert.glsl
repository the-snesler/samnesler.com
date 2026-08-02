#version 300 es
in vec3 position;
in vec3 normal;
in float aHeight;

uniform mat3 normalMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

out vec3 vWorld;
out vec3 vNormal;

void main() {
    // Static deformation: the field is evaluated once on the CPU (terrain.ts) and applied
    // here, so the mesh stays a plain grid and nothing recomputes noise per frame.
    vec3 displaced = vec3(position.xy, position.z + aHeight);
    vWorld = displaced;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
}
