precision highp float;
precision highp sampler3D;

uniform sampler3D uVolume;
uniform sampler3D uDiffVolume;
uniform sampler2D uTransferFunction;
uniform vec3 uCameraPos;
uniform mat4 uInvViewMatrix;
uniform mat4 uInvProjMatrix;
uniform vec2 uResolution;
uniform vec3 uBoxMin;
uniform vec3 uBoxMax;
uniform float uStepSize;
uniform float uStepRef;
uniform float uGradLow;
uniform float uGradHigh;
uniform float uGradWeight;
uniform bool uHasDiff;
uniform bool uDiffMode;
uniform bool uShowOriginal;
uniform bool uShowDifference;
// ── YG lighting / preview uniforms ──
uniform float uDensityScale;
uniform vec3 uLightDir;
uniform float uLightIntensity;
uniform int uPreviewMode;
uniform vec2 uPreviewRange;
uniform vec3 uPreviewColor;
uniform sampler3D uVolumeB;
uniform vec3 uPreviewColorPos;
uniform vec3 uPreviewColorNeg;
uniform float uPreviewDiffScale;
uniform int uPreviewOverlay;
// ── 统一色板：差异图层红/蓝 ──
uniform vec3 uDiffColorGrowth;
uniform vec3 uDiffColorDecline;
// ── ZYJ: 密度直方图筛选高亮 ──
uniform vec2 uHighlightRange;
uniform float uHighlightIntensity;

varying vec2 vUv;

struct Ray {
    vec3 origin;
    vec3 dir;
};

float hash(vec2 p) {
    float h = dot(p, vec2(127.1, 311.7));
    return fract(sin(h) * 43758.5453);
}

bool intersectBox(Ray ray, vec3 boxMin, vec3 boxMax, out float tNear, out float tFar) {
    vec3 invDir = 1.0 / ray.dir;
    vec3 t1 = (boxMin - ray.origin) * invDir;
    vec3 t2 = (boxMax - ray.origin) * invDir;
    vec3 tMin = min(t1, t2);
    vec3 tMax = max(t1, t2);
    tNear = max(max(tMin.x, tMin.y), tMin.z);
    tFar = min(min(tMax.x, tMax.y), tMax.z);
    return tNear <= tFar && tFar > 0.0;
}

vec4 transferFunction(float density) {
    return texture2D(uTransferFunction, vec2(density, 0.5));
}

vec3 calcGradient(vec3 texCoord, out float mag) {
    float step = 1.0 / 128.0;
    float vL = texture(uVolume, texCoord - vec3(step, 0.0, 0.0)).r;
    float vR = texture(uVolume, texCoord + vec3(step, 0.0, 0.0)).r;
    float vD = texture(uVolume, texCoord - vec3(0.0, step, 0.0)).r;
    float vU = texture(uVolume, texCoord + vec3(0.0, step, 0.0)).r;
    float vB = texture(uVolume, texCoord - vec3(0.0, 0.0, step)).r;
    float vF = texture(uVolume, texCoord + vec3(0.0, 0.0, step)).r;
    vec3 g = vec3(vR - vL, vU - vD, vF - vB);
    mag = length(g);
    return mag < 1e-4 ? vec3(0.0) : -g / mag;
}

vec3 phongShade(vec3 color, vec3 normal, vec3 lightDir, vec3 viewDir) {
    vec3 halfDir = normalize(lightDir + viewDir);
    float diff = max(dot(normal, lightDir), 0.0);
    float spec = pow(max(dot(normal, halfDir), 0.0), 32.0);
    float ambient = 0.08;
    float diffuse = 0.6;
    float specular = 0.32;
    return color * (ambient + diffuse * diff) + vec3(1.0) * specular * spec;
}

void main() {
    vec2 ndc = vUv * 2.0 - 1.0;
    vec4 clipNear = vec4(ndc, -1.0, 1.0);
    vec4 eyeNear = uInvProjMatrix * clipNear;
    eyeNear /= eyeNear.w;
    vec3 viewDir = normalize(eyeNear.xyz);
    vec3 worldDir = normalize((uInvViewMatrix * vec4(viewDir, 0.0)).xyz);

    Ray ray;
    ray.origin = uCameraPos;
    ray.dir = worldDir;

    float tNear, tFar;
    if (!intersectBox(ray, uBoxMin, uBoxMax, tNear, tFar)) {
        discard;
    }
    tNear = max(tNear, 0.0);

    vec3 boxSize = uBoxMax - uBoxMin;
    vec3 lightDir = normalize(vec3(1.0, 1.0, -0.5));
    int maxSteps = int(ceil((tFar - tNear) / uStepSize));
    maxSteps = min(maxSteps, 512);

    float jitter = hash(gl_FragCoord.xy) * uStepSize;
    float t = tNear + jitter;

    vec4 accum = vec4(0.0);
    float stepRatio = uStepSize / uStepRef;

    for (int i = 0; i < 512; i++) {
        if (i >= maxSteps) break;
        if (accum.a > 0.99) break;

        vec3 pos = ray.origin + t * ray.dir;
        vec3 texCoord = (pos - uBoxMin) / boxSize;
        texCoord = clamp(texCoord, 0.0, 1.0);

        float density = texture(uVolume, texCoord).r;
        float diffVal = 0.0;
        if (uHasDiff) {
            diffVal = texture(uDiffVolume, texCoord).r;
        }

        // ── YG Preview Mode (for thumbnail generation) ──
        if (uPreviewMode == 2) {
            float densityB = texture(uVolumeB, texCoord).r;
            float maxD = max(density, densityB);
            float edge = 0.02;
            float inRange = smoothstep(uPreviewRange.x, uPreviewRange.x + edge, maxD)
                          * (1.0 - smoothstep(uPreviewRange.y, uPreviewRange.y + edge, maxD));
            float diff_b = (density - densityB) * uPreviewDiffScale;
            float mag_b = clamp(abs(diff_b), 0.0, 1.0);
            vec3 diffColor = diff_b >= 0.0 ? uPreviewColorPos : uPreviewColorNeg;
            vec3 baseColor = vec3(maxD * 0.8 + 0.15);
            vec3 overlay = diffColor * (0.35 + 0.65 * mag_b);
            vec3 mixed = uPreviewOverlay == 1 ? mix(baseColor, overlay, 0.85) : overlay;
            float alpha = (uPreviewOverlay == 1) ? max(0.35, mag_b) : mag_b;
            vec4 tfColor = vec4(mixed, alpha * inRange);
            float ma = 1.0 - accum.a;
            accum.rgb += ma * tfColor.a * tfColor.rgb;
            accum.a += ma * tfColor.a;
        } else if (uPreviewMode == 1) {
            float edge = 0.02;
            float inRange = smoothstep(uPreviewRange.x, uPreviewRange.x + edge, density)
                          * (1.0 - smoothstep(uPreviewRange.y, uPreviewRange.y + edge, density));
            vec4 tfColor = vec4(uPreviewColor * (0.2 + 0.8 * inRange), inRange);
            float ma = 1.0 - accum.a;
            accum.rgb += ma * tfColor.a * tfColor.rgb;
            accum.a += ma * tfColor.a;
        }
        // ── 普通模式 / 差异分析模式 ──
        else if (density > 0.005 || (uHasDiff && abs(diffVal) > 0.01)) {
            vec4 tfColor = transferFunction(density);
            float alpha = tfColor.a;

            // ── ZYJ: 密度直方图筛选（计算体素是否在选中范围内）──
            float inRange = 1.0;  // 默认全部可见
            if (uHighlightIntensity > 0.0 && uHighlightRange.x < uHighlightRange.y) {
                float edge = 0.003;
                inRange = smoothstep(uHighlightRange.x - edge, uHighlightRange.x, density)
                        * (1.0 - smoothstep(uHighlightRange.y, uHighlightRange.y + edge, density));
            }

            // 判断是否为分类变化体素
            bool isChanged = uHasDiff && abs(diffVal) > 0.01;

            // uDiffMode=true: 仅渲染变化体素，由子开关控制显示内容
            // uDiffMode=false: 渲染全部体素 (正常模式)
            bool showHere;
            if (uDiffMode) {
                showHere = isChanged && (uShowOriginal || uShowDifference);
            } else {
                showHere = alpha > 0.005;
            }

            if (showHere) {
                float gradMag;
                vec3 normal = calcGradient(texCoord, gradMag);

                float alphaCorrected;
                if (uDiffMode) {
                    // 差异模式: 根据子开关决定混合方式
                    if (uShowOriginal && uShowDifference) {
                        // 两个都开: TF颜色打底 + 红/蓝叠加
                        alphaCorrected = 1.0 - pow(1.0 - alpha, stepRatio);
                        if (uGradWeight > 0.0 && gradMag > 1e-4) {
                            float gradFactor = smoothstep(uGradLow, uGradHigh, gradMag);
                            alphaCorrected = mix(alphaCorrected, alphaCorrected * gradFactor, uGradWeight);
                        }
                        // Phong 光照
                        if (length(normal) > 1e-4) {
                            vec3 vDir = normalize(uCameraPos - pos);
                            tfColor.rgb = phongShade(tfColor.rgb, normal, lightDir, vDir);
                        }
                        // 红/蓝叠加
                        vec3 diffColor = diffVal > 0.0 ? uDiffColorGrowth : uDiffColorDecline;
                        float intensity = clamp(abs(diffVal) * 0.55, 0.0, 1.0);
                        tfColor.rgb = mix(tfColor.rgb, diffColor, intensity);
                        alphaCorrected = max(alphaCorrected, intensity * 0.5);

                    } else if (uShowOriginal) {
                        // 仅原始体: TF颜色 + Phong光照
                        alphaCorrected = 1.0 - pow(1.0 - alpha, stepRatio);
                        if (uGradWeight > 0.0 && gradMag > 1e-4) {
                            float gradFactor = smoothstep(uGradLow, uGradHigh, gradMag);
                            alphaCorrected = mix(alphaCorrected, alphaCorrected * gradFactor, uGradWeight);
                        }
                        if (length(normal) > 1e-4) {
                            vec3 vDir = normalize(uCameraPos - pos);
                            tfColor.rgb = phongShade(tfColor.rgb, normal, lightDir, vDir);
                        }

                    } else {
                        // 仅变化着色: 纯红/蓝着色
                        vec3 diffColor = diffVal > 0.0 ? uDiffColorGrowth : uDiffColorDecline;
                        float intensity = clamp(abs(diffVal) * 0.55, 0.0, 1.0);
                        tfColor.rgb = diffColor;
                        alphaCorrected = intensity * 0.8;
                    }
                } else {
                    // 普通模式: TF + Phong光照
                    alphaCorrected = 1.0 - pow(1.0 - alpha, stepRatio);
                    if (uGradWeight > 0.0 && gradMag > 1e-4) {
                        float gradFactor = smoothstep(uGradLow, uGradHigh, gradMag);
                        alphaCorrected = mix(alphaCorrected, alphaCorrected * gradFactor, uGradWeight);
                    }
                    if (length(normal) > 1e-4) {
                        vec3 vDir = normalize(uCameraPos - pos);
                        tfColor.rgb = phongShade(tfColor.rgb, normal, lightDir, vDir);
                    }
                    // ── ZYJ: 密度直方图筛选 ──
                    if (uHighlightIntensity > 0.0) {
                        if (inRange < 0.5) {
                            // 范围外: 完全不可见
                            alphaCorrected = 0.0;
                        }
                    }
                }

                float ma = 1.0 - accum.a;
                accum.rgb += ma * alphaCorrected * tfColor.rgb;
                accum.a += ma * alphaCorrected;
            }
        }
        t += uStepSize;
    }

    vec3 bgColor = vec3(1.0, 1.0, 1.0);
    accum.rgb += (1.0 - accum.a) * bgColor;
    gl_FragColor = vec4(accum.rgb, 1.0);
}
