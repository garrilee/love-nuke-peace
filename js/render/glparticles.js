'use strict';

// Dense smoke and spark layers share an atlas and one quad per GPU instance.
// Physics stays in FX; the vertex shader expands each rectangle in submission order.
Object.assign(Gl, {
  particleLayer(blend) {
    const P = window.PIXI, gl = this.renderer.gl;
    if (!this.renderer.context.webGLVersion ||
        (this.renderer.context.webGLVersion < 2 && !gl.getExtension('ANGLE_instanced_arrays'))) {
      return this.spriteLayer(blend);
    }
    if (!this.particleAtlas) {
      const sources = [...new Set([...Object.values(FX.S), ...FX.hue])];
      const canvas = document.createElement('canvas');
      canvas.width = 1024; canvas.height = 1024;
      const cx = canvas.getContext('2d'), frames = new Map();
      const texture = P.Texture.from(canvas);
      // Padding isolates neighboring images; linear sampling preserves soft edges.
      texture.baseTexture.mipmap = P.MIPMAP_MODES.OFF;
      let x = 2, y = 2, rowH = 0;
      const frameFor = (tex) => {
        let frame = frames.get(tex);
        if (frame) return frame;
        // Ultimate abilities create additional country-colored sprites lazily.
        const src = tex.baseTexture.resource.source;
        if (x + src.width + 2 > canvas.width) { x = 2; y += rowH + 4; rowH = 0; }
        if (y + src.height + 2 > canvas.height) throw new Error('Particle atlas capacity exceeded');
        cx.drawImage(src, x, y);
        frame = [x / 1024, y / 1024, src.width / 1024, src.height / 1024];
        frames.set(tex, frame);
        x += src.width + 4; rowH = Math.max(rowH, src.height);
        texture.baseTexture.update();
        return frame;
      };
      for (const src of sources) frameFor(this.tex(src));
      this.particleAtlas = { texture, frames, frameFor };
    }
    const atlas = this.particleAtlas;
    const shader = P.Shader.from(`
      precision highp float;
      attribute vec2 aCorner;
      attribute vec4 aRect;
      attribute vec4 aFrame;
      attribute float aAlpha;
      uniform mat3 projectionMatrix;
      uniform mat3 translationMatrix;
      varying vec2 vUv;
      varying float vAlpha;
      void main() {
        vUv = aFrame.xy + aCorner * aFrame.zw;
        vAlpha = aAlpha;
        vec2 p = aRect.xy + aCorner * aRect.zw;
        gl_Position = vec4((projectionMatrix * translationMatrix * vec3(p, 1.0)).xy, 0.0, 1.0);
      }`, `
      precision mediump float;
      uniform sampler2D uAtlas;
      varying vec2 vUv;
      varying float vAlpha;
      void main() { gl_FragColor = texture2D(uAtlas, vUv) * vAlpha; }
    `, { uAtlas: atlas.texture });
    let data = new Float32Array(512 * 9), view = null;
    const buffer = new P.Buffer(data, false);
    const geometry = new P.Geometry()
      .addAttribute('aCorner', [0, 0, 1, 0, 1, 1, 0, 1], 2)
      .addAttribute('aRect', buffer, 4, false, P.TYPES.FLOAT, 36, 0, true)
      .addAttribute('aFrame', buffer, 4, false, P.TYPES.FLOAT, 36, 16, true)
      .addAttribute('aAlpha', buffer, 1, false, P.TYPES.FLOAT, 36, 32, true)
      .addIndex([0, 1, 2, 0, 2, 3]);
    const mesh = new P.Mesh(geometry, shader); mesh.blendMode = blend;
    return {
      c: mesh, n: 0, shown: 0,
      img(tex, x, y, w, h, a) {
        if (a <= 0.004) return;
        const frame = atlas.frameFor(tex);
        const offset = this.n * 9;
        if (offset + 9 > data.length) { const next = new Float32Array(data.length * 2); next.set(data); data = next; view = null; }
        data[offset] = x; data[offset + 1] = y; data[offset + 2] = w; data[offset + 3] = h;
        data[offset + 4] = frame[0]; data[offset + 5] = frame[1]; data[offset + 6] = frame[2]; data[offset + 7] = frame[3];
        data[offset + 8] = Math.min(1, Math.max(0, a));
        this.n++;
      },
      end() {
        mesh.visible = this.n > 0; geometry.instanceCount = this.n;
        if (this.n) {
          if (!view || view.length !== this.n * 9) view = data.subarray(0, this.n * 9);
          buffer.update(view);
        }
        this.shown = this.n; this.n = 0;
      },
    };
  },
});
