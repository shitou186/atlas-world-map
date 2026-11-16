// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
import {
  TextureLoader,
  RepeatWrapping,
  LinearFilter,
  Vector3,
  MeshLambertMaterial,
  DoubleSide,
} from 'three';
import { assetUrl } from '../urls.js';
class WaterMaterial {
  constructor(map, cameraPosition) {
    const textureLoader = new TextureLoader();
    this.bump = textureLoader.load(assetUrl('/textures/WaterBumpAndReflection.png'), () =>
      map.triggerRepaint(),
    );
    this.bump.wrapS = this.bump.wrapT = RepeatWrapping;
    this.bump.generateMipmaps = false;
    this.bump.minFilter = this.bump.magFilter = LinearFilter;
    this.sky = textureLoader.load(assetUrl('/textures/GradientSky.png'), () => map.triggerRepaint());
    this.sky.minFilter = this.sky.magFilter = LinearFilter;
    this.sky.generateMipmaps = false;
    this.uniforms = {
      waterBump: {
        value: this.bump,
      },
      waterSky: {
        value: this.sky,
      },
      waterTime: {
        value: 0,
      },
      waterSun: {
        value: new Vector3(0, 0, 1),
      },
      waterEye: {
        value: cameraPosition,
      },
    };
  }
  create() {
    const material = new MeshLambertMaterial({
      side: DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 0,
      polygonOffsetUnits: -2,
    });
    // 共享水面时间、太阳与观察位置，注入波纹法线和天空反射着色。
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader =
        `varying vec3 waterPoint;
` +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
waterPoint = (modelMatrix * vec4(position, 1.0)).xyz;`,
        );
      shader.fragmentShader =
        `
        uniform sampler2D waterBump;
        uniform sampler2D waterSky;
        uniform float waterTime;
        uniform vec3 waterSun;
        uniform vec3 waterEye;
        varying vec3 waterPoint;
      ` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <shadowmap_pars_fragment>',
        `#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `
        vec3 eye = normalize(waterEye - waterPoint);
        vec2 uv = waterPoint.xy / 256.0;
        vec3 bump0 = texture2D(waterBump, 3.0 * uv + 0.015 * waterTime).xyz;
        vec3 bump1 = texture2D(waterBump, 2.0 * uv - 0.025 * waterTime).xyz;
        vec3 bump = normalize(bump0 + bump1 + vec3(-1.0, -1.0, 0.0));
        float fresnel = texture2D(waterBump, bump.xy + eye.xy * min(0.5, eye.z)).a;
        float specular = 0.75 * pow(max(dot(reflect(-waterSun, bump), eye), 0.0), 64.0);
        vec3 horizon = texture2D(waterSky, vec2(waterSun.z + 0.05, 1.0)).rgb;
        vec3 water = texture2D(waterSky, vec2(waterSun.z + 0.05, 0.05)).rgb;
        vec3 shine = texture2D(waterSky, vec2(waterSun.z + 0.05, 0.0)).rgb;
        vec3 color = mix(water, horizon, fresnel * fresnel) + shine * specular * getShadowMask();
        diffuseColor.rgb = mix(color / 12.92, pow((color + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), color));
      `,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
        'vec3 outgoingLight = diffuseColor.rgb * mix(0.73, 1.0, getShadowMask());',
      );
    };
    material.customProgramCacheKey = () => 'water-bump-sky';
    return material;
  }
  dispose() {
    this.bump.dispose();
    this.sky.dispose();
  }
}
export { WaterMaterial };
