import { Renderer, Camera, Transform, Geometry, Sphere, Mesh, Program, Texture } from 'ogl';
import type { OGLRenderingContext } from 'ogl';

import type { SeafloorConfig, SeafloorUniforms } from './types.js';
import { SEAFLOOR_BOUNDS, buildTerrainGeometry, makeHeightField, mulberry32, scatterFlora, scatterRocks } from './terrain.js';
import type { FloraInstances, HeightField } from './terrain.js';

import terrainVert from './terrain.vert.glsl';
import terrainFrag from './terrain.frag.glsl';
import rockVert from './rock.vert.glsl';
import rockFrag from './rock.frag.glsl';
import floraVert from './flora.vert.glsl';
import floraFrag from './flora.frag.glsl';

const SEAGRASS = { url: '/textures/seagrass.png', frameCount: 19, blocksPerFrame: 2 };
const KELP = { url: '/textures/kelp.png', frameCount: 20, blocksPerFrame: 1 };

/** World units per 16px texture block. */
const BLOCK_SIZE = 0.55;

/** Camera sits just above the floor looking forward, mirroring WaterEffect's view from below. */
const CAMERA_POSITION: [number, number, number] = [0, -10, 3.4];
const CAMERA_TARGET: [number, number, number] = [0, 5.2, 0.6];

/** World Y where the haze starts and where it has fully swallowed the geometry. */
const FOG_RANGE: [number, number] = [9, 19];

const checkTheme = () => {
  const isDark = document.documentElement.classList.contains('dark');
  return {
    uSandCol: { value: isDark ? [0.494, 0.396, 0.729] : [0.949, 0.882, 0.996] },
    uSandDeepCol: { value: isDark ? [0.078, 0.047, 0.184] : [0.463, 0.353, 0.667] },
    uRockCol: { value: isDark ? [0.18, 0.145, 0.318] : [0.573, 0.482, 0.741] },
    uFloraCol: { value: isDark ? [0.098, 0.071, 0.227] : [0.263, 0.161, 0.51] },
    uFloraTipCol: { value: isDark ? [0.42, 0.353, 0.749] : [0.494, 0.384, 0.788] },
    uCausticCol: { value: isDark ? [0.514, 0.435, 0.855] : [0.996, 0.949, 1.0] },
    uFogCol: { value: isDark ? [0.243, 0.129, 0.482] : [0.886, 0.757, 0.945] }
  };
};

export class SeafloorEffect {
  private renderer: Renderer;
  private camera: Camera;
  private scene: Transform;
  private programs: Program[] = [];
  private meshes: Mesh[] = [];
  private uniforms: SeafloorUniforms;
  private animationId: number | null = null;
  private startTime: number;
  private config: Required<SeafloorConfig>;
  private height: HeightField;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, config: SeafloorConfig = {}) {
    this.config = {
      height: 500,
      subdivisions: 192,
      animationSpeed: 1.0,
      terrainAmplitude: 1.05,
      rockCount: 240,
      grassCount: 700,
      kelpCount: 90,
      seed: 1235,
      ...config
    };

    this.startTime = Date.now();
    this.height = makeHeightField(this.config.seed, this.config.terrainAmplitude);

    this.renderer = new Renderer({
      canvas,
      width: canvas.width,
      height: canvas.height,
      alpha: true,
      antialias: false,
      depth: true,
      premultipliedAlpha: false
    });
    this.renderer.gl.clearColor(0, 0, 0, 0);

    this.camera = new Camera(this.renderer.gl, {
      fov: 60,
      aspect: canvas.width / canvas.height,
      near: 0.05,
      far: 120
    });
    this.camera.up.set(0, 0, 1); // Z-up scene; without this the look-at direction is degenerate.
    this.camera.position.set(...CAMERA_POSITION);
    this.camera.lookAt(CAMERA_TARGET);

    this.scene = new Transform();
    this.uniforms = {
      uTime: { value: Math.round(Math.random() * 1000) },
      uFogRange: { value: FOG_RANGE },
      ...checkTheme()
    };

    const rand = mulberry32(this.config.seed);
    this.buildTerrain();
    this.buildRocks(rand);
    this.buildFlora(rand);

    this.animate();
  }

  private get gl(): OGLRenderingContext {
    return this.renderer.gl;
  }

  private addMesh(geometry: Geometry, vertex: string, fragment: string, extra: Record<string, { value: unknown }> = {}): Mesh {
    const program = new Program(this.gl, {
      vertex,
      fragment,
      // Uniform objects are shared by reference across programs, so bumping uTime or swapping
      // the palette once in animate() reaches every material.
      uniforms: { ...this.uniforms, ...extra },
      transparent: true,
      cullFace: false
    });
    const mesh = new Mesh(this.gl, {
      geometry,
      program,
      // OGL culls against the base geometry's bounding sphere. For instanced geometry that
      // sphere sits at the origin rather than around the instances, so every rock and plant
      // gets dropped before it is ever submitted.
      frustumCulled: !geometry.isInstanced
    });
    mesh.setParent(this.scene);
    this.programs.push(program);
    this.meshes.push(mesh);
    return mesh;
  }

  private buildTerrain(): void {
    const span = SEAFLOOR_BOUNDS.maxY - SEAFLOOR_BOUNDS.minY;
    const segX = this.config.subdivisions;
    const segY = Math.max(8, Math.round((segX * span) / (SEAFLOOR_BOUNDS.maxX - SEAFLOOR_BOUNDS.minX)));
    const geometry = buildTerrainGeometry(this.gl, SEAFLOOR_BOUNDS, segX, segY, this.height);
    this.addMesh(geometry, terrainVert, terrainFrag, { uAmplitude: { value: this.config.terrainAmplitude } });
  }

  private buildRocks(rand: () => number): void {
    const rocks = scatterRocks(this.config.rockCount, rand, SEAFLOOR_BOUNDS, this.height);

    // A coarse sphere is only the starting shape — rock.vert.glsl pushes each vertex along
    // its own axis to break it into facets, so this segment count is plenty of silhouette.
    const geometry = new Sphere(this.gl, { radius: 1, widthSegments: 8, heightSegments: 6 });
    geometry.addAttribute('aOffset', { instanced: 1, size: 3, data: rocks.offset });
    geometry.addAttribute('aScale', { instanced: 1, size: 3, data: rocks.scale });
    geometry.addAttribute('aSeed', { instanced: 1, size: 1, data: rocks.seed });

    this.addMesh(geometry, rockVert, rockFrag);
  }

  private buildFlora(rand: () => number): void {
    const grass = scatterFlora(this.config.grassCount, rand, this.height, {
      minY: SEAFLOOR_BOUNDS.minY + 1,
      maxY: SEAFLOOR_BOUNDS.maxY - 1,
      spreadX: 34,
      minBlocks: 2,
      maxBlocks: 2,
      blocksPerFrame: SEAGRASS.blocksPerFrame,
      blockSize: BLOCK_SIZE,
      frameCount: SEAGRASS.frameCount,
      clumpSize: 7
    });

    // Kelp is kept off the very front of the plane: this close to the camera a 4-unit stalk
    // would fill the whole band.
    const kelp = scatterFlora(this.config.kelpCount, rand, this.height, {
      minY: 1.0,
      maxY: SEAFLOOR_BOUNDS.maxY - 2,
      spreadX: 30,
      minBlocks: 5,
      maxBlocks: 11,
      blocksPerFrame: KELP.blocksPerFrame,
      blockSize: BLOCK_SIZE,
      frameCount: KELP.frameCount,
      clumpSize: 3
    });

    this.addFloraMesh(grass, SEAGRASS.url, SEAGRASS.frameCount, 6.5, 0.16, 2.1);
    this.addFloraMesh(kelp, KELP.url, KELP.frameCount, 5.0, 0.1, 1.15);
  }

  private addFloraMesh(instances: FloraInstances, url: string, frameCount: number, frameRate: number, swayAmount: number, swaySpeed: number): void {
    const texture = new Texture(this.gl, {
      generateMipmaps: false,
      minFilter: this.gl.NEAREST,
      magFilter: this.gl.NEAREST,
      wrapS: this.gl.CLAMP_TO_EDGE,
      wrapT: this.gl.CLAMP_TO_EDGE,
      flipY: false
    });

    const image = new Image();
    image.onload = () => {
      if (this.disposed) return;
      texture.image = image;

      // Quad standing in XZ: x in [-0.5, 0.5], z in [0, 1].
      const geometry = new Geometry(this.gl, {
        position: { size: 3, data: new Float32Array([-0.5, 0, 0, 0.5, 0, 0, -0.5, 0, 1, 0.5, 0, 1]) },
        uv: { size: 2, data: new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]) },
        index: { data: new Uint16Array([0, 1, 2, 2, 1, 3]) },
        aOffset: { instanced: 1, size: 3, data: instances.offset },
        aScale: { instanced: 1, size: 2, data: instances.scale },
        aPhase: { instanced: 1, size: 1, data: instances.phase },
        aFrame: { instanced: 1, size: 1, data: instances.frame },
        aTiles: { instanced: 1, size: 1, data: instances.tiles }
      });

      this.addMesh(geometry, floraVert, floraFrag, {
        uTex: { value: texture },
        uFrameCount: { value: frameCount },
        uFrameRate: { value: frameRate },
        uSwayAmount: { value: swayAmount },
        uSwaySpeed: { value: swaySpeed }
      });

      // Under prefers-reduced-motion (or offscreen) the loop is already stopped, so this
      // late-arriving mesh would never be drawn. Push one static frame instead.
      if (this.animationId === null) this.renderer.render({ scene: this.scene, camera: this.camera });
    };
    // Recovery is to render the floor and rocks without this species rather than fail the scene.
    image.onerror = () => console.warn(`Seafloor: could not load ${url}; skipping that flora layer.`);
    image.src = url;
  }

  private animate = (): void => {
    this.animationId = requestAnimationFrame(this.animate);
    this.uniforms.uTime.value = ((Date.now() - this.startTime) / 1000) * this.config.animationSpeed;

    const theme = checkTheme();
    for (const key of Object.keys(theme) as (keyof typeof theme)[]) {
      this.uniforms[key].value = theme[key].value;
    }

    this.renderer.render({ scene: this.scene, camera: this.camera });
  };

  public resize(width: number, height: number): void {
    this.renderer.setSize(width, height);
    this.camera.perspective({ aspect: width / height });
  }

  public pause(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  public resume(): void {
    if (this.animationId === null) this.animate();
  }

  public destroy(): void {
    this.pause();
    this.disposed = true;

    const gl = this.gl;
    for (const program of this.programs) {
      if (program.program) gl.deleteProgram(program.program);
    }
    for (const mesh of this.meshes) {
      for (const attribute of Object.values(mesh.geometry.attributes)) {
        if (attribute.buffer) gl.deleteBuffer(attribute.buffer);
      }
    }
    this.programs = [];
    this.meshes = [];
  }
}
