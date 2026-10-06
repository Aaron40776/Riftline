// 3.20.0: the Ultra look (Settings, Graphics: Ultra), for devices that can afford it. The owner's words: "it's all looking
// like a kids game, we need more professional style". What made it read as a toy: flat even light, saturated colours and a
// soft blob under everything. The Ultra look changes that without touching the game: a filmic tone curve, real shadows of
// the sun on the floor (a shadow catcher over the floor shader), the scene drawn into a multisampled half-float target and
// graded in one pass (a little less saturation, cool shadows and warm lights, a vignette and a fine film grain). Nothing
// here runs unless the setting is on; the other settings draw exactly as before.
import {
  ACESFilmicToneMapping,
  Color,
  HalfFloatType,
  Mesh,
  NoToneMapping,
  OrthographicCamera,
  PCFSoftShadowMap,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  ShadowMaterial,
  Vector2,
  WebGLRenderTarget,
} from "three";

const GRADE_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;
const GRADE_FRAG = `
uniform sampler2D tDiffuse;
uniform vec2 uRes;
uniform float uTime;
uniform float uExposure;
uniform float uSat;
uniform float uVig;
uniform float uGrain;
uniform vec3 uShadowTint;
uniform vec3 uLightTint;
varying vec2 vUv;
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
void main() {
  vec3 col = texture2D(tDiffuse, vUv).rgb;
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  // less saturation, the shadows a little cool and the lights a little warm (in linear light, before the tone curve)
  col *= uExposure;
  luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(luma), col, uSat);
  col *= mix(uShadowTint, uLightTint, smoothstep(0.02, 0.9, luma));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  // in display light: the vignette (the corners fall away) and a fine grain that moves
  vec2 d = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float vig = smoothstep(0.95, 0.25, length(d));
  gl_FragColor.rgb *= mix(1.0, vig, uVig);
  gl_FragColor.rgb += (hash(floor(vUv * uRes) + fract(uTime) * 91.7) - 0.5) * uGrain;
}`;

// how much light the picture needs before the tone curve: the dark places need more, the pale Cryo Vault much less
const EXPOSURE = { yard: 2.2, works: 1.9, vault: 1.25, marsh: 1.9, void: 2.1 };
class Look {
  constructor(renderer) {
    this.r = renderer;
    this.on = false;
    this.target = null;
    this.frame = 0;
    this.marked = new WeakSet();
    // the pass: a quad that fills the screen, drawn with its own camera
    this.camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new Mesh(
      new PlaneGeometry(2, 2),
      new ShaderMaterial({
        uniforms: {
          tDiffuse: { value: null },
          uRes: { value: new Vector2(1, 1) },
          uTime: { value: 0 },
          uExposure: { value: 1.8 },
          uSat: { value: 0.9 },
          uVig: { value: 0.55 },
          uGrain: { value: 0.028 },
          uShadowTint: { value: new Color(0.94, 0.98, 1.08) },
          uLightTint: { value: new Color(1.06, 1.0, 0.93) },
        },
        vertexShader: GRADE_VERT,
        fragmentShader: GRADE_FRAG,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.quad.frustumCulled = false;
    this.pass = new Scene();
    this.pass.add(this.quad);
    // the shadows of the sun fall on a plane that draws nothing but them, just above the floor
    this.catcher = new Mesh(new PlaneGeometry(120, 120), new ShadowMaterial({ opacity: 0.5, depthWrite: false }));
    this.catcher.rotation.x = -Math.PI / 2;
    this.catcher.position.y = 0.012;
    this.catcher.receiveShadow = true;
    this.catcher.renderOrder = 1;
    this.catcher.visible = false;
    renderer.scene.add(this.catcher);
  }
  set(on) {
    on = !!on;
    if (on === this.on) return;
    this.on = on;
    const r = this.r,
      gl = r.renderer;
    gl.toneMapping = on ? ACESFilmicToneMapping : NoToneMapping;
    gl.toneMappingExposure = 1;
    gl.shadowMap.enabled = on;
    gl.shadowMap.type = PCFSoftShadowMap;
    r.sun.castShadow = on;
    if (on) {
      const s = r.sun.shadow;
      s.mapSize.set(2048, 2048);
      s.bias = -0.0004;
      s.normalBias = 0.03;
      s.radius = 3;
      const half = 30;
      Object.assign(s.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 70 });
      s.camera.updateProjectionMatrix();
      r.sun.target.position.set(0, 0, 0);
      r.scene.add(r.sun.target);
    }
    this.catcher.visible = on;
    // the blob under every thing is replaced by the real shadow
    r.shadows.mesh.visible = !on;
    if (!on && this.target) {
      this.target.dispose();
      this.target = null;
    }
    // the programs of the lit materials change with the shadow map: let them be built again
    r.scene.traverse((obj) => {
      if (obj.material) for (const m of [].concat(obj.material)) m.needsUpdate = true;
    });
    this.marked = new WeakSet();
    this.frame = 0;
    r.resize(true);
  }
  resize(w, h) {
    if (!this.on) return;
    if (this.target) this.target.setSize(w, h);
    else {
      this.target = new WebGLRenderTarget(w, h, { type: HalfFloatType, samples: 4 });
    }
    this.quad.material.uniforms.uRes.value.set(w, h);
  }
  // what can throw a shadow: the lit solids (the walker, the enemies, the props); not the glows, rings, sprites and beams
  mark() {
    const r = this.r;
    r.scene.traverse((obj) => {
      if (!obj.isMesh || this.marked.has(obj) || obj === this.catcher || obj === this.quad) return;
      this.marked.add(obj);
      const m = obj.material;
      if (!m || Array.isArray(m)) return;
      const lit = m.isMeshLambertMaterial || m.isMeshStandardMaterial || m.isMeshPhongMaterial;
      obj.castShadow = !!lit && !m.transparent && m.blending !== 2;
    });
  }
  // the follow of the sun: the shadow map covers the arena around the player
  render(scene, camera, time) {
    const r = this.r;
    if (this.frame++ % 20 === 0) this.mark();
    if (!this.target) this.resize(Math.max(1, Math.round(r.w * r.dpr)), Math.max(1, Math.round(r.h * r.dpr)));
    // (the pool shows its mesh again whenever it has instances: the blob under every thing stays off)
    r.shadows.mesh.visible = false;
    const gl = r.renderer;
    gl.setRenderTarget(this.target);
    gl.clear();
    gl.render(scene, camera);
    gl.setRenderTarget(null);
    const u = this.quad.material.uniforms;
    u.uExposure.value = EXPOSURE[r.biome ? r.biome.id : "yard"] || 1.8;
    u.tDiffuse.value = this.target.texture;
    u.uTime.value = time;
    gl.render(this.pass, this.camera);
  }
}

export { Look };
