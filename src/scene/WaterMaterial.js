// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
import {
  TextureLoader,
  RepeatWrapping,
  LinearFilter,
  Vector3,
  MeshLambertMaterial,
  DoubleSide,
} from 'three';
class WaterMaterial {
  constructor(i, o) {
    const p = new TextureLoader();
    this.bump = p.load('/textures/WaterBumpAndReflection.png', () => i.triggerRepaint());
    this.bump.wrapS = this.bump.wrapT = RepeatWrapping;
    this.bump.generateMipmaps = false;
    this.bump.minFilter = this.bump.magFilter = LinearFilter;
    this.sky = p.load('/textures/GradientSky.png', () => i.triggerRepaint());
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
        value: o,
      },
    };
  }
  create() {
    const i = new MeshLambertMaterial({
      side: DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 0,
      polygonOffsetUnits: -2,
    });
    i.onBeforeCompile = (o) => {
      Object.assign(o.uniforms, this.uniforms);
      o.vertexShader =
        `varying vec3 waterPoint;
` +
        o.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
waterPoint = (modelMatrix * vec4(position, 1.0)).xyz;`,
        );
      o.fragmentShader =
        `
        uniform sampler2D waterBump;
        uniform sampler2D waterSky;
        uniform float waterTime;
        uniform vec3 waterSun;
        uniform vec3 waterEye;
        varying vec3 waterPoint;
      ` + o.fragmentShader;
      o.fragmentShader = o.fragmentShader.replace(
        '#include <shadowmap_pars_fragment>',
        `#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>`,
      );
      o.fragmentShader = o.fragmentShader.replace(
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
      o.fragmentShader = o.fragmentShader.replace(
        'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
        'vec3 outgoingLight = diffuseColor.rgb * mix(0.73, 1.0, getShadowMask());',
      );
    };
    i.customProgramCacheKey = () => 'water-bump-sky';
    return i;
  }
  dispose() {
    this.bump.dispose();
    this.sky.dispose();
  }
}
export { WaterMaterial };
