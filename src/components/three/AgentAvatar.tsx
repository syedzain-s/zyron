'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { damp } from '@/lib/utils';

/**
 * ZYRON's body.
 *
 * The model is a rigged robot with one baked 14.75-second animation and, in
 * its original form, a UV-checker texture rather than a real one. So two
 * things happen on load:
 *
 *   1. Every material is replaced with the same gold-and-white metallic pair.
 *      This is not a cosmetic shortcut — the source texture is a test grid, so
 *      overriding is the only way it looks like anything, and it puts the model
 *      inside the site's palette rather than beside it.
 *
 *   2. The single clip is driven at different speeds per state, with
 *      procedural motion layered on top. The clip has no named sub-ranges to
 *      split on, so inventing labelled segments would be guessing at what is
 *      in the timeline. Speed plus an overlay is honest and reads correctly.
 */

export type AvatarState = 'idle' | 'thinking' | 'speaking' | 'activity';

/** Served from /public/models. Draco decoder is self-hosted — see the README. */
const MODEL_URL = '/models/agent.glb';
const DRACO_PATH = '/draco/';

/**
 * World-units tall, measured and applied at load. Swapping the model file no
 * longer means re-tuning `scale` at every call site.
 */
const TARGET_HEIGHT = 2.6;

interface AgentAvatarProps {
  state?: AvatarState;
  scale?: number;
  position?: [number, number, number];
  /** Lean toward the pointer. Off inside small fixed panels where it looks odd. */
  followPointer?: boolean;
}

const SPEED: Record<AvatarState, number> = {
  idle: 0.45,
  thinking: 1.35,
  speaking: 0.9,
  activity: 1.6,
};

export function AgentAvatar({
  state = 'idle',
  scale = 1,
  position = [0, 0, 0],
  followPointer = true,
}: AgentAvatarProps) {
  const group = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);

  const { scene, animations } = useGLTF(MODEL_URL, DRACO_PATH);
  const { actions, mixer } = useAnimations(animations, group);

  /**
   * Two corrections are applied at load, both traceable to the source file.
   *
   * The model came out of FBX, which is Z-up, and its transform chain leaves a
   * -90° rotation about X on the armature that nothing cancels. Left alone the
   * figure lies on its back with the legs above the body.
   *
   * Then, rather than hand-tuning scale and Y offset until it looks right, the
   * bounds are measured after the rotation and the model is normalised to a
   * fixed height with its feet on the origin. Guessed numbers only hold for
   * one model; this holds for any of them.
   */
  const model = useMemo(() => {
    const clone = scene.clone(true);

    // Undo the leftover Z-up correction.
    clone.rotation.x = Math.PI / 2;
    clone.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    box.getSize(size);

    if (size.y > 0.0001) {
      const fit = TARGET_HEIGHT / size.y;
      clone.scale.multiplyScalar(fit);
      clone.updateMatrixWorld(true);

      // Re-measure after scaling, then drop the feet onto y = 0.
      const scaled = new THREE.Box3().setFromObject(clone);
      const centre = new THREE.Vector3();
      scaled.getCenter(centre);
      clone.position.x -= centre.x;
      clone.position.z -= centre.z;
      clone.position.y -= scaled.min.y;
    }

    const body = new THREE.MeshPhysicalMaterial({
      color: '#C8A44D',
      metalness: 1,
      roughness: 0.24,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      envMapIntensity: 1.8,
    });

    const trim = new THREE.MeshPhysicalMaterial({
      color: '#EDEEF3',
      metalness: 0.9,
      roughness: 0.16,
      clearcoat: 1,
      envMapIntensity: 2.1,
    });

    let index = 0;
    clone.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // Alternating the two finishes across parts gives the panel-and-trim
      // look without needing the model to have separate material slots.
      mesh.material = index % 3 === 0 ? trim : body;
      index += 1;
    });

    return clone;
  }, [scene]);

  // Cross-fade rather than cut, so a state change reads as the same character
  // changing pace instead of a different animation starting.
  useEffect(() => {
    const first = Object.values(actions)[0];
    if (!first) return;
    first.reset().fadeIn(0.4).play();
    return () => {
      first.fadeOut(0.3);
    };
  }, [actions]);

  const jump = useRef(0);
  const bob = useRef(0);

  useFrame((frame, delta) => {
    const dt = Math.min(delta, 0.1);
    const t = frame.clock.elapsedTime;

    mixer.timeScale = damp(mixer.timeScale || 1, SPEED[state], 4, dt);

    if (!inner.current || !group.current) return;

    // Speaking: a small nod on top of the clip, roughly conversational pace.
    const target = state === 'speaking' ? 1 : 0;
    bob.current = damp(bob.current, target, 5, dt);
    inner.current.rotation.x = Math.sin(t * 3.4) * 0.055 * bob.current;

    // Activity: an actual jump arc. A rigid hop suits a robot, where the same
    // trick on a human figure would look broken.
    const wantJump = state === 'activity' ? 1 : 0;
    jump.current = damp(jump.current, wantJump, 4, dt);
    const hop = Math.abs(Math.sin(t * 2.4)) * 0.34 * jump.current;
    inner.current.position.y = hop;
    inner.current.scale.setScalar(1 - hop * 0.06);

    // Thinking: a slow scan, as if working something out.
    const scan = state === 'thinking' ? Math.sin(t * 0.9) * 0.3 : 0;
    const pointer = followPointer ? frame.pointer.x * 0.45 : 0;
    group.current.rotation.y = damp(group.current.rotation.y, pointer + scan, 3, dt);
  });

  return (
    <group ref={group} position={position} scale={scale} dispose={null}>
      <group ref={inner}>
        <primitive object={model} />
        <Laptop open={state === 'speaking' || state === 'thinking'} />
      </group>
    </group>
  );
}

/**
 * The device it carries.
 *
 * Built from primitives rather than parented to a hand bone: the rig's joints
 * are named `Bone_01`, `Bone.010_02` and so on, with nothing to identify a
 * wrist, so any bone lookup would be a guess that breaks silently if the model
 * is ever swapped. Held at chest height instead — reliable, and it stays
 * readable at the small sizes this renders at.
 *
 * Open while speaking or thinking, shut during an activity, because it should
 * be obvious at a glance whether ZYRON is working or asking you to move.
 */
function Laptop({ open }: { open: boolean }) {
  const lid = useRef<THREE.Mesh>(null);
  const rig = useRef<THREE.Group>(null);
  const amount = useRef(0);

  useFrame((frame, delta) => {
    const dt = Math.min(delta, 0.1);
    const t = frame.clock.elapsedTime;

    amount.current = damp(amount.current, open ? 1 : 0, 6, dt);

    if (lid.current) {
      // Shut is flat on the base; open leans back past vertical, the way a
      // laptop actually sits.
      lid.current.rotation.x = -0.08 - amount.current * 1.75;
    }
    if (rig.current) {
      rig.current.position.y = 0.62 + Math.sin(t * 1.6) * 0.012;
      rig.current.visible = amount.current > 0.02;
    }
  });

  return (
    <group ref={rig} position={[0, 0.62, 0.52]} rotation={[0, 0, 0]} scale={0.42}>
      {/* Base */}
      <mesh castShadow>
        <boxGeometry args={[0.9, 0.035, 0.62]} />
        <meshPhysicalMaterial color="#EDEEF3" metalness={1} roughness={0.2} clearcoat={1} />
      </mesh>

      {/* Lid, hinged at the back edge */}
      <group position={[0, 0.018, -0.31]}>
        <mesh ref={lid} position={[0, 0.29, 0]} castShadow>
          <boxGeometry args={[0.9, 0.58, 0.028]} />
          <meshPhysicalMaterial color="#C8A44D" metalness={1} roughness={0.22} clearcoat={1} />
        </mesh>
      </group>

      {/* The screen glow, so it reads as switched on from a distance */}
      <group position={[0, 0.018, -0.31]}>
        <mesh position={[0, 0.29, 0.018]} rotation={[0, 0, 0]}>
          <planeGeometry args={[0.78, 0.48]} />
          <meshBasicMaterial color="#ECD79F" transparent opacity={0.55} side={THREE.DoubleSide} />
        </mesh>
      </group>

      <pointLight position={[0, 0.5, 0.2]} intensity={1.6} distance={2} color="#ECD79F" />
    </group>
  );
}

useGLTF.preload(MODEL_URL, DRACO_PATH);
