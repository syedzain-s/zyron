'use client';

import { Environment, Lightformer } from '@react-three/drei';

/**
 * One shared lighting rig for every scene.
 *
 * The environment map is built in-scene from Lightformers rather than loaded
 * with `<Environment preset="…" />`. A preset downloads an HDR from a CDN at
 * runtime; on a slow or filtered connection that request never resolves, the
 * surrounding Suspense boundary never settles, and the entire canvas renders
 * nothing — the page looks like it has no 3D at all. Building the map from
 * light panels is offline, instant, and gives cleaner control over what the
 * gold metal reflects.
 */
export function StageLights({ env = true }: { env?: boolean }) {
  return (
    <>
      <ambientLight intensity={0.25} />

      {/* Warm key from the upper left, the light the user is standing in. */}
      <directionalLight position={[-5, 6, 4]} intensity={1.9} color="#FFF1D6" />
      {/* Cold chocolate bounce from below right, so the shadows are not dead. */}
      <directionalLight position={[6, -3, -2]} intensity={0.7} color="#2C3852" />
      <spotLight position={[0, 8, 6]} angle={0.6} penumbra={1} intensity={2.4} color="#FFF8E6" />

      {env && (
        <Environment resolution={256} frames={1}>
          {/* Broad soft ceiling — the main highlight running across metal. */}
          <Lightformer
            form="rect"
            intensity={2.6}
            color="#FFF1D6"
            position={[0, 5, -6]}
            scale={[12, 6, 1]}
          />
          {/* Two gold strip lights: these are what read as polished brass. */}
          <Lightformer
            form="rect"
            intensity={4.2}
            color="#ECD79F"
            position={[-6, 2, 2]}
            rotation={[0, Math.PI / 2, 0]}
            scale={[8, 3, 1]}
          />
          <Lightformer
            form="rect"
            intensity={3.4}
            color="#C8A44D"
            position={[6, -1, 2]}
            rotation={[0, -Math.PI / 2, 0]}
            scale={[8, 3, 1]}
          />
          {/* Chocolate floor bounce keeps the underside from going pure black. */}
          <Lightformer
            form="rect"
            intensity={1.1}
            color="#0A1428"
            position={[0, -5, 1]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={[10, 10, 1]}
          />
          {/* A small bright ring for the specular glint on curved surfaces. */}
          <Lightformer
            form="ring"
            intensity={5}
            color="#FFF8E6"
            position={[-2, 3, 4]}
            scale={[2, 2, 1]}
          />
        </Environment>
      )}
    </>
  );
}
