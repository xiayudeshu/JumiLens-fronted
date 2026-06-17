import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import vertShader from './shaders/volume.vert.glsl';
import fragShader from './shaders/volume.frag.glsl';
import { volumeStore, type TFControlPoint } from '../../../../store/volumeStore';
import { COLORS, hexToRgb } from '@/constants/colors';

export class VolumeScene {
  private renderer: THREE.WebGLRenderer;
  private orthoCamera: THREE.OrthographicCamera;
  private perspCamera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private scene: THREE.Scene;
  private material: THREE.ShaderMaterial;
  private volumeTexture: THREE.Data3DTexture | null = null;
  private diffTexture: THREE.Data3DTexture | null = null;
  private tfTexture: THREE.DataTexture | null = null;
  private container: HTMLElement;
  private animFrameId: number | null = null;
  private _timeAccum = 0;
  private _clock: THREE.Clock;

  constructor(container: HTMLElement) {
    this.container = container;
    this._clock = new THREE.Clock();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setClearColor(0xffffff, 1);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);

    const w = container.clientWidth;
    const h = Math.max(container.clientHeight, 1);
    const aspect = w / h;

    this.perspCamera = new THREE.PerspectiveCamera(45, aspect, 0.1, 10);
    this.perspCamera.position.set(1.5, 1.0, 2.0);
    this.perspCamera.lookAt(0, 0, 0);

    this.controls = new OrbitControls(this.perspCamera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.update();

    this.orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.material = new THREE.ShaderMaterial({
      vertexShader: vertShader,
      fragmentShader: fragShader,
      uniforms: {
        uVolume: { value: null },
        uTransferFunction: { value: null },
        uCameraPos: { value: new THREE.Vector3() },
        uInvViewMatrix: { value: new THREE.Matrix4() },
        uInvProjMatrix: { value: new THREE.Matrix4() },
        uResolution: { value: new THREE.Vector2(w, h) },
        uBoxMin: { value: new THREE.Vector3(-0.5, -0.5, -0.5) },
        uBoxMax: { value: new THREE.Vector3(0.5, 0.5, 0.5) },
        uStepSize: { value: 1.0 / 64 },
        // ── Main diff / gradient uniforms ──
        uStepRef: { value: 1.0 / 128 },
        uGradLow: { value: 0.02 },
        uGradHigh: { value: 0.15 },
        uGradWeight: { value: 0.6 },
        uDiffVolume: { value: null },
        uHasDiff: { value: false },
        uDiffMode: { value: false },
        uShowOriginal: { value: true },
        uShowDifference: { value: true },
        uDiffColorGrowth: { value: new THREE.Vector3(...hexToRgb(COLORS.diffLayer.growth)) },
        uDiffColorDecline: { value: new THREE.Vector3(...hexToRgb(COLORS.diffLayer.decline)) },
        // ── YG lighting / preview uniforms ──
        uDensityScale: { value: volumeStore.densityScale },
        uLightDir: { value: new THREE.Vector3(0.6, 0.6, -0.5).normalize() },
        uLightIntensity: { value: volumeStore.lightIntensity },
        uPreviewMode: { value: 0 },
        uPreviewRange: { value: new THREE.Vector2(0.0, 1.0) },
        uPreviewColor: { value: new THREE.Vector3(1.0, 1.0, 1.0) },
        uVolumeB: { value: null },
        uPreviewColorPos: { value: new THREE.Vector3(...hexToRgb(COLORS.diffLayer.growthPreview)) },
        uPreviewColorNeg: { value: new THREE.Vector3(...hexToRgb(COLORS.diffLayer.declinePreview)) },
        uPreviewDiffScale: { value: 3.0 },
        uPreviewOverlay: { value: 1 },
        // ── ZYJ: 密度直方图筛选高亮 ──
        uHighlightRange: { value: new THREE.Vector2(0, 0) },
        uHighlightIntensity: { value: 0.0 },
      },
      depthTest: false,
      depthWrite: false,
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    const quadMesh = new THREE.Mesh(geometry, this.material);

    this.scene = new THREE.Scene();
    this.scene.add(quadMesh);

    this.buildTFTexture(volumeStore.transferFunction);
    this.updateLighting(volumeStore.lightAzimuth, volumeStore.lightElevation, volumeStore.lightIntensity);
    this.updateDensityScale(volumeStore.densityScale);
    this.startLoop();
  }

  loadVolumeData(data: Float32Array): void {
    if (this.volumeTexture) {
      this.volumeTexture.dispose();
    }

    const texture = this.createVolumeTexture(data);
    this.volumeTexture = texture;
    this.material.uniforms.uVolume.value = texture;
  }

  private createVolumeTexture(data: Float32Array): THREE.Data3DTexture {
    const texture = new THREE.Data3DTexture(data, 128, 128, 128);
    texture.format = THREE.RedFormat;
    texture.type = THREE.FloatType;
    texture.internalFormat = 'R32F';
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.wrapR = THREE.ClampToEdgeWrapping;
    texture.unpackAlignment = 1;
    texture.needsUpdate = true;
    return texture;
  }

  buildTFTexture(controlPoints: TFControlPoint[]): void {
    if (this.tfTexture) {
      this.tfTexture.dispose();
    }

    const res = 256;
    const pixels = new Uint8Array(res * 4);

    for (let i = 0; i < res; i++) {
      const t = i / (res - 1);
      const c = this.evaluateTF(controlPoints, t);
      const idx = i * 4;
      pixels[idx] = Math.round(c.r * 255);
      pixels[idx + 1] = Math.round(c.g * 255);
      pixels[idx + 2] = Math.round(c.b * 255);
      pixels[idx + 3] = Math.round(c.a * 255);
    }

    const texture = new THREE.DataTexture(pixels, res, 1, THREE.RGBAFormat);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;

    this.tfTexture = texture;
    this.material.uniforms.uTransferFunction.value = texture;
  }

  private evaluateTF(
    points: TFControlPoint[],
    t: number
  ): { r: number; g: number; b: number; a: number } {
    if (points.length === 0) return { r: 0, g: 0, b: 0, a: 0 };
    if (t <= points[0].position) {
      return {
        r: points[0].color[0],
        g: points[0].color[1],
        b: points[0].color[2],
        a: points[0].opacity,
      };
    }
    const last = points[points.length - 1];
    if (t >= last.position) {
      return { r: last.color[0], g: last.color[1], b: last.color[2], a: last.opacity };
    }

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      if (t >= p0.position && t <= p1.position) {
        const frac = (t - p0.position) / (p1.position - p0.position);
        return {
          r: p0.color[0] + (p1.color[0] - p0.color[0]) * frac,
          g: p0.color[1] + (p1.color[1] - p0.color[1]) * frac,
          b: p0.color[2] + (p1.color[2] - p0.color[2]) * frac,
          a: p0.opacity + (p1.opacity - p0.opacity) * frac,
        };
      }
    }

    return { r: last.color[0], g: last.color[1], b: last.color[2], a: last.opacity };
  }

  updateStepSize(stepSize: number): void {
    this.material.uniforms.uStepSize.value = stepSize;
  }

  // ── Main: gradient params ──
  updateGradientParams(gradLow: number, gradHigh: number, gradWeight: number): void {
    this.material.uniforms.uGradLow.value = gradLow;
    this.material.uniforms.uGradHigh.value = gradHigh;
    this.material.uniforms.uGradWeight.value = gradWeight;
  }

  // ── Main: diff volume ──
  loadDiffVolume(data: Float32Array | null): void {
    if (this.diffTexture) {
      this.diffTexture.dispose();
      this.diffTexture = null;
    }

    if (data) {
      const texture = new THREE.Data3DTexture(data, 128, 128, 128);
      texture.format = THREE.RedFormat;
      texture.type = THREE.FloatType;
      texture.internalFormat = 'R32F';
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.wrapR = THREE.ClampToEdgeWrapping;
      texture.unpackAlignment = 1;
      texture.needsUpdate = true;

      this.diffTexture = texture;
      this.material.uniforms.uDiffVolume.value = texture;
      this.material.uniforms.uHasDiff.value = true;
    } else {
      this.material.uniforms.uDiffVolume.value = null;
      this.material.uniforms.uHasDiff.value = false;
    }
  }

  setDiffMode(enabled: boolean): void {
    this.material.uniforms.uDiffMode.value = enabled;
  }

  /** Toggle diff overlay visibility without disposing the texture */
  setDiffVisible(visible: boolean): void {
    this.material.uniforms.uHasDiff.value = visible && this.diffTexture !== null;
  }

  setDiffToggles(showOriginal: boolean, showDifference: boolean): void {
    this.material.uniforms.uShowOriginal.value = showOriginal;
    this.material.uniforms.uShowDifference.value = showDifference;
  }

  // ── ZYJ: 密度直方图筛选高亮 ──
  updateHighlightRange(range: { min: number; max: number } | null): void {
    console.log('[VolumeScene] updateHighlightRange:', range);
    if (range) {
      this.material.uniforms.uHighlightRange.value.set(range.min, range.max);
      this.material.uniforms.uHighlightIntensity.value = 0.8;
      console.log('[VolumeScene] uniforms set: uHighlightRange=(', range.min, ',', range.max, ') uHighlightIntensity=0.8');
    } else {
      this.material.uniforms.uHighlightRange.value.set(0, 0);
      this.material.uniforms.uHighlightIntensity.value = 0.0;
      console.log('[VolumeScene] uniforms cleared');
    }
  }

  // ── YG: density scale ──
  updateDensityScale(scale: number): void {
    this.material.uniforms.uDensityScale.value = scale;
  }

  // ── YG: lighting ──
  updateLighting(azimuthDeg: number, elevationDeg: number, intensity: number): void {
    const az = THREE.MathUtils.degToRad(azimuthDeg);
    const el = THREE.MathUtils.degToRad(elevationDeg);
    const dir = new THREE.Vector3(
      Math.cos(el) * Math.cos(az),
      Math.sin(el),
      Math.cos(el) * Math.sin(az)
    ).normalize();
    this.material.uniforms.uLightDir.value.copy(dir);
    this.material.uniforms.uLightIntensity.value = intensity;
  }

  // ── YG: preview thumbnail (single volume highlight) ──
  renderThumbnail(
    data: Float32Array,
    range: [number, number],
    previewColor: [number, number, number],
    view: 'current' | 'top' | 'front' | 'side',
    size: { width: number; height: number } = { width: 120, height: 90 }
  ): string {
    const { width, height } = size;
    const renderTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
    });

    const prevVolume = this.material.uniforms.uVolume.value as THREE.Data3DTexture | null;
    const prevVolumeB = this.material.uniforms.uVolumeB.value as THREE.Data3DTexture | null;
    const prevStep = this.material.uniforms.uStepSize.value as number;
    const prevPreviewMode = this.material.uniforms.uPreviewMode.value as number;
    const prevRange = this.material.uniforms.uPreviewRange.value.clone();
    const prevColor = this.material.uniforms.uPreviewColor.value.clone();
    const prevCameraPos = this.material.uniforms.uCameraPos.value.clone();
    const prevInvView = this.material.uniforms.uInvViewMatrix.value.clone();
    const prevInvProj = this.material.uniforms.uInvProjMatrix.value.clone();

    const prevCamPos = this.perspCamera.position.clone();
    const prevCamQuat = this.perspCamera.quaternion.clone();
    const prevCamUp = this.perspCamera.up.clone();

    const tempTexture = this.createVolumeTexture(data);
    this.material.uniforms.uVolume.value = tempTexture;
    this.material.uniforms.uVolumeB.value = null;
    this.material.uniforms.uPreviewMode.value = 1;
    this.material.uniforms.uPreviewRange.value.set(range[0], range[1]);
    this.material.uniforms.uPreviewColor.value.set(
      previewColor[0],
      previewColor[1],
      previewColor[2]
    );
    this.material.uniforms.uStepSize.value = Math.min(prevStep, 1.0 / 96);

    const cam = this.perspCamera;
    if (view === 'top') {
      cam.position.set(0, 2.0, 0);
      cam.up.set(0, 0, -1);
      cam.lookAt(0, 0, 0);
    } else if (view === 'front') {
      cam.position.set(0, 0, 2.0);
      cam.up.set(0, 1, 0);
      cam.lookAt(0, 0, 0);
    } else if (view === 'side') {
      cam.position.set(2.0, 0, 0);
      cam.up.set(0, 1, 0);
      cam.lookAt(0, 0, 0);
    } else {
      cam.position.copy(prevCamPos);
      cam.quaternion.copy(prevCamQuat);
      cam.up.copy(prevCamUp);
    }
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();

    this.material.uniforms.uCameraPos.value.copy(cam.position);
    this.material.uniforms.uInvViewMatrix.value.copy(cam.matrixWorld);
    this.material.uniforms.uInvProjMatrix.value.copy(cam.projectionMatrixInverse);

    const prevTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(renderTarget);
    this.renderer.render(this.scene, this.orthoCamera);

    const pixels = new Uint8Array(width * height * 4);
    this.renderer.readRenderTargetPixels(renderTarget, 0, 0, width, height, pixels);
    this.renderer.setRenderTarget(prevTarget);

    // ── Fast flip: bulk row copy instead of per-pixel loop ──
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const imageData = ctx.createImageData(width, height);
      const rowBytes = width * 4;
      for (let y = 0; y < height; y++) {
        const srcStart = (height - 1 - y) * rowBytes;
        imageData.data.set(pixels.subarray(srcStart, srcStart + rowBytes), y * rowBytes);
      }
      ctx.putImageData(imageData, 0, 0);
    }

    // ── JPEG encoding: much faster + smaller than PNG ──
    const dataUrl = canvas.toDataURL('image/jpeg', 0.75);

    renderTarget.dispose();
    tempTexture.dispose();

    this.material.uniforms.uVolume.value = prevVolume;
    this.material.uniforms.uVolumeB.value = prevVolumeB;
    this.material.uniforms.uStepSize.value = prevStep;
    this.material.uniforms.uPreviewMode.value = prevPreviewMode;
    this.material.uniforms.uPreviewRange.value.copy(prevRange);
    this.material.uniforms.uPreviewColor.value.copy(prevColor);
    this.material.uniforms.uCameraPos.value.copy(prevCameraPos);
    this.material.uniforms.uInvViewMatrix.value.copy(prevInvView);
    this.material.uniforms.uInvProjMatrix.value.copy(prevInvProj);

    this.perspCamera.position.copy(prevCamPos);
    this.perspCamera.quaternion.copy(prevCamQuat);
    this.perspCamera.up.copy(prevCamUp);
    this.perspCamera.updateMatrixWorld();

    return dataUrl;
  }

  // ── YG: preview thumbnail (A-B diff) ──
  renderThumbnailDiff(
    dataA: Float32Array,
    dataB: Float32Array,
    range: [number, number],
    view: 'current' | 'top' | 'front' | 'side',
    overlayBase: boolean,
    size: { width: number; height: number } = { width: 120, height: 90 }
  ): string {
    const { width, height } = size;
    const renderTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
    });

    const prevVolume = this.material.uniforms.uVolume.value as THREE.Data3DTexture | null;
    const prevVolumeB = this.material.uniforms.uVolumeB.value as THREE.Data3DTexture | null;
    const prevStep = this.material.uniforms.uStepSize.value as number;
    const prevPreviewMode = this.material.uniforms.uPreviewMode.value as number;
    const prevRange = this.material.uniforms.uPreviewRange.value.clone();
    const prevColor = this.material.uniforms.uPreviewColor.value.clone();
    const prevColorPos = this.material.uniforms.uPreviewColorPos.value.clone();
    const prevColorNeg = this.material.uniforms.uPreviewColorNeg.value.clone();
    const prevDiffScale = this.material.uniforms.uPreviewDiffScale.value as number;
    const prevOverlay = this.material.uniforms.uPreviewOverlay.value as number;
    const prevCameraPos = this.material.uniforms.uCameraPos.value.clone();
    const prevInvView = this.material.uniforms.uInvViewMatrix.value.clone();
    const prevInvProj = this.material.uniforms.uInvProjMatrix.value.clone();

    const prevCamPos = this.perspCamera.position.clone();
    const prevCamQuat = this.perspCamera.quaternion.clone();
    const prevCamUp = this.perspCamera.up.clone();

    const textureA = this.createVolumeTexture(dataA);
    const textureB = this.createVolumeTexture(dataB);
    this.material.uniforms.uVolume.value = textureA;
    this.material.uniforms.uVolumeB.value = textureB;
    this.material.uniforms.uPreviewMode.value = 2;
    this.material.uniforms.uPreviewRange.value.set(range[0], range[1]);
    this.material.uniforms.uPreviewColor.value.set(1.0, 1.0, 1.0);
    this.material.uniforms.uPreviewColorPos.value.set(...hexToRgb(COLORS.diffLayer.growthPreview));
    this.material.uniforms.uPreviewColorNeg.value.set(...hexToRgb(COLORS.diffLayer.declinePreview));
    this.material.uniforms.uPreviewDiffScale.value = 6.0;
    this.material.uniforms.uPreviewOverlay.value = overlayBase ? 1 : 0;
    this.material.uniforms.uStepSize.value = Math.min(prevStep, 1.0 / 96);

    const cam = this.perspCamera;
    if (view === 'top') {
      cam.position.set(0, 2.0, 0);
      cam.up.set(0, 0, -1);
      cam.lookAt(0, 0, 0);
    } else if (view === 'front') {
      cam.position.set(0, 0, 2.0);
      cam.up.set(0, 1, 0);
      cam.lookAt(0, 0, 0);
    } else if (view === 'side') {
      cam.position.set(2.0, 0, 0);
      cam.up.set(0, 1, 0);
      cam.lookAt(0, 0, 0);
    } else {
      cam.position.copy(prevCamPos);
      cam.quaternion.copy(prevCamQuat);
      cam.up.copy(prevCamUp);
    }
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();

    this.material.uniforms.uCameraPos.value.copy(cam.position);
    this.material.uniforms.uInvViewMatrix.value.copy(cam.matrixWorld);
    this.material.uniforms.uInvProjMatrix.value.copy(cam.projectionMatrixInverse);

    const prevTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(renderTarget);
    this.renderer.render(this.scene, this.orthoCamera);

    const pixels = new Uint8Array(width * height * 4);
    this.renderer.readRenderTargetPixels(renderTarget, 0, 0, width, height, pixels);
    this.renderer.setRenderTarget(prevTarget);

    // ── Fast flip: bulk row copy instead of per-pixel loop ──
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const imageData = ctx.createImageData(width, height);
      const rowBytes = width * 4;
      for (let y = 0; y < height; y++) {
        const srcStart = (height - 1 - y) * rowBytes;
        imageData.data.set(pixels.subarray(srcStart, srcStart + rowBytes), y * rowBytes);
      }
      ctx.putImageData(imageData, 0, 0);
    }

    // ── JPEG encoding: much faster + smaller than PNG ──
    const dataUrl = canvas.toDataURL('image/jpeg', 0.75);

    renderTarget.dispose();
    textureA.dispose();
    textureB.dispose();

    this.material.uniforms.uVolume.value = prevVolume;
    this.material.uniforms.uVolumeB.value = prevVolumeB;
    this.material.uniforms.uStepSize.value = prevStep;
    this.material.uniforms.uPreviewMode.value = prevPreviewMode;
    this.material.uniforms.uPreviewRange.value.copy(prevRange);
    this.material.uniforms.uPreviewColor.value.copy(prevColor);
    this.material.uniforms.uPreviewColorPos.value.copy(prevColorPos);
    this.material.uniforms.uPreviewColorNeg.value.copy(prevColorNeg);
    this.material.uniforms.uPreviewDiffScale.value = prevDiffScale;
    this.material.uniforms.uPreviewOverlay.value = prevOverlay;
    this.material.uniforms.uCameraPos.value.copy(prevCameraPos);
    this.material.uniforms.uInvViewMatrix.value.copy(prevInvView);
    this.material.uniforms.uInvProjMatrix.value.copy(prevInvProj);

    this.perspCamera.position.copy(prevCamPos);
    this.perspCamera.quaternion.copy(prevCamQuat);
    this.perspCamera.up.copy(prevCamUp);
    this.perspCamera.updateMatrixWorld();

    return dataUrl;
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height);
    const aspect = width / Math.max(height, 1);
    this.perspCamera.aspect = aspect;
    this.perspCamera.updateProjectionMatrix();
    this.material.uniforms.uResolution.value.set(width, height);
  }

  private startLoop(): void {
    const animate = (): void => {
      this.animFrameId = requestAnimationFrame(animate);
      this.controls.update();

      if (volumeStore.isPlaying) {
        const delta = this._clock.getDelta();
        this._timeAccum += delta;
        const stepDuration = 1.0 / volumeStore.playSpeed;
        if (this._timeAccum >= stepDuration) {
          this._timeAccum -= stepDuration;
          volumeStore.advanceStep(1);
        }
      }

      this.material.uniforms.uCameraPos.value.copy(this.perspCamera.position);
      this.material.uniforms.uInvViewMatrix.value.copy(this.perspCamera.matrixWorld);
      this.material.uniforms.uInvProjMatrix.value.copy(
        this.perspCamera.projectionMatrixInverse
      );

      this.renderer.render(this.scene, this.orthoCamera);
    };

    animate();
  }

  dispose(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
    }
    this.controls.dispose();
    this.renderer.dispose();
    if (this.volumeTexture) this.volumeTexture.dispose();
    if (this.diffTexture) this.diffTexture.dispose();
    if (this.tfTexture) this.tfTexture.dispose();
    this.material.dispose();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}
