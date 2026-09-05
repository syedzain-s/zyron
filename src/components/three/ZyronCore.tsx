'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Float, Icosahedron, Torus } from '@react-three/drei';
import * as THREE from 'three';
import { damp } from '@/lib/utils';

const vertex = /* glsl */ `
  uniform float uTime;
  uniform float uAmplitude;
  uniform float uSpeed;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying float vDisplace;

  vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}

  float snoise(vec3 v){
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  void main() {
    vNormal = normalize(normalMatrix * normal);
    float n  = snoise(position * 1.35 + vec3(0.0, uTime * uSpeed, 0.0));
    float n2 = snoise(position * 3.10 - vec3(uTime * uSpeed * 0.6));
    float displace = n * uAmplitude + n2 * uAmplitude * 0.28;
    vDisplace = displace;
    vec3 pos = position + normal * displace;
    vPosition = pos;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const fragment = /* glsl */ `
  uniform vec3  uCoreColor;
  uniform vec3  uEdgeColor;
  uniform float uTime;
  varying vec3  vNormal;
  varying vec3  vPosition;
  varying float vDisplace;

  void main() {
    // Fresnel rim so the sphere reads as a lit volume rather than a flat disc.
    vec3 viewDir = normalize(cameraPosition - vPosition);
    float fresnel = pow(1.0 - max(dot(viewDir, normalize(vNormal)), 0.0), 2.4);

    float energy = smoothstep(-0.25, 0.35, vDisplace);
    vec3 color = mix(uCoreColor, uEdgeColor, energy);
    color += uEdgeColor * fresnel * 1.35;

    // Slow internal banding — something is clearly processing in there.
    float bands = sin(vPosition.y * 9.0 - uTime * 1.1) * 0.5 + 0.5;
    color += uEdgeColor * bands * 0.06;

    gl_FragColor = vec4(color, 0.55 + fresnel * 0.45);
  }
`;

interface ZyronCoreProps {
  /** 0 = idle, 1 = fully engaged. Drives amplitude, speed and colour push. */
  intensity?: number;
  scale?: number;
  position?: [number, number, number];
}

/**
 * The agent's body. A displaced icosphere with a fresnel shell, wrapped in a
 * wireframe cage and two gyroscopic rings. This is ZYRON's visual identity and
 * it reappears at reduced scale in the navbar and the console.
 */
/**
 * Temporarily switched off.
 *
 * The displaced sphere was a placeholder for ZYRON's physical presence, and it
 * is being replaced by an actual agent model. Rather than tearing the mount
 * points out of three scenes and putting them back later, the component holds
 * the slot and renders nothing. Flip this to `true` to bring the sphere back;
 * when the avatar lands, its mesh goes in below and the flag disappears.
 */
const CORE_ENABLED = false;

export function ZyronCore({ intensity = 0.35, scale = 1, position = [0, 0, 0] }: ZyronCoreProps) {
  const shellRef = useRef<THREE.Mesh>(null);
  const cageRef = useRef<THREE.Mesh>(null);
  const ringA = useRef<THREE.Mesh>(null);
  const ringB = useRef<THREE.Mesh>(null);

  const target = useRef(intensity);
  target.current = intensity;
  const live = useRef(intensity);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uAmplitude: { value: 0.16 },
      uSpeed: { value: 0.35 },
      uCoreColor: { value: new THREE.Color('#0A1428') },
      uEdgeColor: { value: new THREE.Color('#C8A44D') },
    }),
    [],
  );

  const idleHue = useMemo(() => new THREE.Color('#8A6D22'), []);
  const hotHue = useMemo(() => new THREE.Color('#C8A44D'), []);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    const t = state.clock.elapsedTime;
    live.current = damp(live.current, target.current, 3, dt);
    const k = live.current;

    uniforms.uTime.value = t;
    uniforms.uAmplitude.value = 0.11 + k * 0.2;
    uniforms.uSpeed.value = 0.28 + k * 0.85;
    uniforms.uEdgeColor.value.lerpColors(idleHue, hotHue, Math.min(k, 1) * 0.55);

    const px = state.pointer.x;
    const py = state.pointer.y;

    if (shellRef.current) {
      shellRef.current.rotation.y = damp(shellRef.current.rotation.y, t * 0.16 + px * 0.35, 4, dt);
      shellRef.current.rotation.x = damp(shellRef.current.rotation.x, -py * 0.28, 4, dt);
    }
    if (cageRef.current) {
      cageRef.current.rotation.y = -t * 0.09 + px * 0.2;
      cageRef.current.rotation.z = t * 0.05;
    }
    if (ringA.current) {
      ringA.current.rotation.z = t * 0.4;
      ringA.current.rotation.x = Math.PI / 2.4 + py * 0.22;
    }
    if (ringB.current) {
      ringB.current.rotation.z = -t * 0.26;
      ringB.current.rotation.y = Math.PI / 3 + px * 0.24;
    }
  });

  // Placed after the hooks, not before: an early return above `useFrame`
  // would change the hook order between renders.
  if (!CORE_ENABLED) return null;

  return (
    <group position={position} scale={scale}>
      <Float speed={1.1} rotationIntensity={0.15} floatIntensity={0.5}>
        <mesh ref={shellRef}>
          <icosahedronGeometry args={[1.35, 48]} />
          <shaderMaterial
            vertexShader={vertex}
            fragmentShader={fragment}
            uniforms={uniforms}
            transparent
            depthWrite={false}
          />
        </mesh>

        {/* Wireframe cage — reads as containment and governance. */}
        <Icosahedron ref={cageRef} args={[1.72, 1]}>
          <meshBasicMaterial color="#C8A44D" wireframe transparent opacity={0.14} />
        </Icosahedron>

        {/* Gyroscopic authority rings, machined from solid gold. Physical
            materials here rather than flat lines: the environment rig gives
            them a moving specular highlight, which is what separates a real
            3D object from an SVG circle. */}
        <Torus ref={ringA} args={[2.06, 0.022, 16, 220]}>
          <meshPhysicalMaterial
            color="#C8A44D"
            metalness={1}
            roughness={0.18}
            clearcoat={1}
            clearcoatRoughness={0.08}
            envMapIntensity={2.2}
          />
        </Torus>
        <Torus ref={ringB} args={[2.46, 0.012, 12, 220]}>
          <meshPhysicalMaterial
            color="#8A6D22"
            metalness={1}
            roughness={0.32}
            envMapIntensity={1.6}
          />
        </Torus>

        <pointLight position={[0, 0, 0]} intensity={7} distance={7} color="#C8A44D" />
      </Float>
    </group>
  );
}
