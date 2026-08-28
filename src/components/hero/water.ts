/**
 * Рябь на воде первого экрана.
 *
 * Вода не рисуется заново: шейдер берёт те же пиксели фотографии и чуть
 * смещает их выборку. Смещение — доли пикселя кадра, зато по закону
 * перспективы: у горизонта волна почти стоит и частит, у нижнего края идёт
 * крупнее и заметнее. Поэтому движение читается как вода, а не как
 * бегущая текстура поверх снимка.
 *
 * Холст лежит ровно на воде (рамка приходит из разбора кадра), а альфа берётся
 * из маски: за её пределами показывается неподвижная фотография, и шва между
 * ними нет — под холстом те же самые пиксели.
 *
 * Нет WebGL — модуль возвращает null, и первый экран остаётся с обычной
 * фотографией.
 */

const VERTEX = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos;
  gl_Position = vec4(aPos.x * 2.0 - 1.0, 1.0 - aPos.y * 2.0, 0.0, 1.0);
}`;

const FRAGMENT = `
precision highp float;

varying vec2 vUv;

uniform sampler2D uPhoto;
uniform sampler2D uMask;
uniform vec4 uRect;      // участок кадра под холстом: x0, y0, x1, y1
uniform float uTime;     // секунды
uniform float uHorizon;  // горизонт в долях высоты кадра
uniform float uAspect;   // ширина кадра к высоте
uniform float uAmp;      // амплитуда смещения в долях высоты кадра

void main() {
  vec2 uv = mix(uRect.xy, uRect.zw, vUv);

  float mask = texture2D(uMask, uv).r;
  if (mask <= 0.004) discard;

  // Плоскость воды в перспективе: чем ближе к горизонту, тем дальше точка.
  // Сжатие намеренно мягче настоящего (слагаемое 0.10): у настоящего волна
  // к горизонту частит быстрее пикселя и рассыпается в шум.
  float below = max(uv.y - uHorizon, 0.0);
  float dist = 1.0 / (below + 0.10);
  vec2 world = vec2((uv.x - 0.5) * uAspect * dist, dist);

  // Три волны с разными направлениями и периодами: 5–8 секунд, как у зыби.
  float swellPhase = world.y * 23.5 + world.x * 4.2 + uTime * 1.15;
  float second = world.y * 36.4 - world.x * 7.0 + uTime * 0.83 + 1.7;
  float chopPhase = world.y * 80.0 + world.x * 15.0 + uTime * 2.4 + 2.3;

  // Мелкая рябь живёт только у ближнего края: дальше она мельче пикселя.
  float near = clamp(below * 2.6, 0.0, 1.0);
  float lift = sin(swellPhase) * 0.62 + sin(second) * 0.38 + sin(chopPhase) * 0.20 * near;

  float amp = uAmp * below * mask;
  vec2 offset = vec2(lift * 0.20 / uAspect, lift) * amp;
  vec3 color = texture2D(uPhoto, uv + offset).rgb;

  // Склон волны ловит свет. Смещение само по себе почти незаметно — именно
  // этот перелив и читается как живая вода.
  float slope = cos(swellPhase);
  color *= 1.0 + slope * 0.055 * mask * near;

  gl_FragColor = vec4(color, mask);
}`;

export type WaterOptions = {
  canvas: HTMLCanvasElement;
  /** Кадр без кабинок: уже загруженный <img>, второй раз не качается. */
  photo: HTMLImageElement;
  mask: HTMLImageElement;
  /** Участок кадра под холстом в долях: [x0, y0, x1, y1]. */
  rect: readonly [number, number, number, number];
  horizon: number;
  aspect: number;
  /** Наибольшее смещение у нижнего края кадра, в пикселях исходника. */
  peak: number;
  height: number;
};

export type Water = {
  /** Кадр анимации; time — секунды от старта. */
  draw(time: number): void;
  /** Пересъём текстуры фотографии (например, после смены srcset). */
  refresh(): void;
  resize(): void;
  dispose(): void;
};

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function upload(gl: WebGLRenderingContext, texture: WebGLTexture, image: HTMLImageElement) {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  // Кадр не степень двойки — только CLAMP и линейная фильтрация.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
}

export function createWater(options: WaterOptions): Water | null {
  const { canvas, photo, mask, rect, horizon, aspect, peak, height } = options;

  const gl =
    canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power',
    }) ?? null;
  if (!gl) return null;

  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) return null;

  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const photoTex = gl.createTexture();
  const maskTex = gl.createTexture();
  if (!photoTex || !maskTex) return null;

  gl.activeTexture(gl.TEXTURE0);
  upload(gl, photoTex, photo);
  gl.activeTexture(gl.TEXTURE1);
  upload(gl, maskTex, mask);

  const uniform = (name: string) => gl.getUniformLocation(program, name);
  gl.uniform1i(uniform('uPhoto'), 0);
  gl.uniform1i(uniform('uMask'), 1);
  gl.uniform4f(uniform('uRect'), rect[0], rect[1], rect[2], rect[3]);
  gl.uniform1f(uniform('uHorizon'), horizon);
  gl.uniform1f(uniform('uAspect'), aspect);
  // Амплитуда задаётся у нижнего края кадра, а в шейдере растёт от горизонта.
  gl.uniform1f(uniform('uAmp'), peak / height / Math.max(0.05, 1 - horizon));
  const uTime = uniform('uTime');

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  let width = 0;
  let tall = 0;

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    // Размер берётся после трансформа сцены: кадр слегка увеличен, и по
    // раскладочной ширине холст вышел бы мягче окружающей фотографии.
    const box = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round((box.width || canvas.clientWidth) * ratio));
    const h = Math.max(1, Math.round((box.height || canvas.clientHeight) * ratio));
    if (w === width && h === tall) return;
    width = w;
    tall = h;
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
  };

  resize();

  return {
    draw(time) {
      gl.useProgram(program);
      gl.uniform1f(uTime, time);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    refresh() {
      gl.activeTexture(gl.TEXTURE0);
      upload(gl, photoTex, photo);
    },
    resize,
    dispose() {
      gl.deleteTexture(photoTex);
      gl.deleteTexture(maskTex);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      canvas.width = 0;
      canvas.height = 0;
    },
  };
}
