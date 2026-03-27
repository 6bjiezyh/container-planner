import { useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Edges, OrbitControls, PerspectiveCamera, Text } from '@react-three/drei'
import { createSceneData } from '../lib/sceneData'
import type { ContainerPlan } from '../lib/containerPlanner'

type ViewPreset = 'iso' | 'top' | 'side'

export function ScenePreview({
  plan,
  visibleCount,
  activePlacementId,
  onSelectPlacement,
}: {
  plan: ContainerPlan | null
  visibleCount: number
  activePlacementId: string | null
  onSelectPlacement: (placementId: string | null) => void
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [viewPreset, setViewPreset] = useState<ViewPreset>('iso')
  const [showShellFill, setShowShellFill] = useState(true)
  const scene = plan ? createSceneData(plan) : null
  const visibleBoxes = scene?.boxes.slice(0, Math.min(visibleCount, scene.boxes.length)) ?? []
  const focusedId =
    hoveredId ??
    activePlacementId ??
    visibleBoxes.at(-1)?.id ??
    null
  const cameraPosition = getCameraPosition(viewPreset, scene?.container.height ?? 2.4)

  return (
    <div className="scene-shell">
      {scene ? (
        <>
          <div className="scene-hud scene-hud-hint">拖拽旋转视角，点击货物查看尺寸</div>
          <div className="scene-hud scene-hud-controls">
            <div className="scene-control-group">
              <button
                className={viewPreset === 'iso' ? 'scene-pill active' : 'scene-pill'}
                onClick={() => setViewPreset('iso')}
                type="button"
              >
                斜视
              </button>
              <button
                className={viewPreset === 'top' ? 'scene-pill active' : 'scene-pill'}
                onClick={() => setViewPreset('top')}
                type="button"
              >
                俯视
              </button>
              <button
                className={viewPreset === 'side' ? 'scene-pill active' : 'scene-pill'}
                onClick={() => setViewPreset('side')}
                type="button"
              >
                侧视
              </button>
            </div>
            <button
              className={showShellFill ? 'scene-pill active' : 'scene-pill'}
              onClick={() => setShowShellFill((current) => !current)}
              type="button"
              >
                {showShellFill ? '显示柜体实体' : '仅线框'}
              </button>
            </div>
        </>
      ) : null}
      <Canvas dpr={[1, 2]} shadows>
        <color attach="background" args={['#f4f1e8']} />
        <ambientLight intensity={1.1} />
        <directionalLight
          castShadow
          intensity={1.5}
          position={[7, 10, 8]}
          shadow-mapSize-height={2048}
          shadow-mapSize-width={2048}
        />
        <PerspectiveCamera key={viewPreset} makeDefault fov={34} position={cameraPosition} />
        <OrbitControls
          enableDamping
          maxPolarAngle={Math.PI / 2.05}
          minDistance={5}
          maxDistance={18}
          target={[0, Math.max((scene?.container.height ?? 2.4) * 0.2, 0.8), 0]}
        />

        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.02, 0]}>
          <planeGeometry args={[14, 10]} />
          <shadowMaterial opacity={0.12} />
        </mesh>

        {scene ? (
          <>
            <ContainerFrame
              height={scene.container.height}
              length={scene.container.length}
              showFill={showShellFill}
              width={scene.container.width}
            />
            <RemainingSpaceFrame
              height={scene.packingSpace.height}
              length={scene.packingSpace.length}
              width={scene.packingSpace.width}
              x={scene.packingSpace.x}
              z={scene.packingSpace.z}
            />
            {visibleBoxes.map((box) => (
              <group key={box.id} position={[box.position.x, box.position.y, box.position.z]}>
                <mesh
                  castShadow
                  onPointerOut={() => setHoveredId(null)}
                  onPointerOver={(event) => {
                    event.stopPropagation()
                    setHoveredId(box.id)
                  }}
                  onClick={(event) => {
                    event.stopPropagation()
                    onSelectPlacement(box.id)
                  }}
                >
                  <boxGeometry args={[box.size.x, box.size.y, box.size.z]} />
                  <meshStandardMaterial
                    {...getBoxMaterialProps(
                      box.packagingVisualType,
                      box.color,
                      box.id === focusedId,
                      box.id === activePlacementId,
                    )}
                  />
                  <Edges
                    color={box.accentColor}
                    lineWidth={box.packagingVisualType === 'wood_crate' ? 2.2 : 1.4}
                    scale={1.003}
                  />
                </mesh>
                {box.packagingVisualType === 'wood_frame' ? (
                  <>
                    <mesh>
                      <boxGeometry
                        args={[box.size.x * 1.008, box.size.y * 1.008, box.size.z * 1.008]}
                      />
                      <meshBasicMaterial color={box.accentColor} transparent opacity={0.85} wireframe />
                    </mesh>
                    <FramePosts box={box} />
                  </>
                ) : null}
                {box.packagingVisualType === 'wood_crate' ? (
                  <CrateStraps box={box} />
                ) : null}
                {box.packagingVisualType === 'paper' ? (
                  <CartonBands box={box} />
                ) : null}
                {box.boxNo ? <BoxNumberLabel box={box} /> : null}
              </group>
            ))}
          </>
        ) : (
          <Placeholder />
        )}
      </Canvas>
    </div>
  )
}

function RemainingSpaceFrame({
  length,
  width,
  height,
  x,
  z,
}: {
  length: number
  width: number
  height: number
  x: number
  z: number
}) {
  return (
    <group position={[x + length / 2, height / 2, z]}>
      <mesh>
        <boxGeometry args={[length, height, width]} />
        <meshBasicMaterial color="#d93232" transparent opacity={0.12} />
      </mesh>
      <mesh>
        <boxGeometry args={[length, height, width]} />
        <meshBasicMaterial color="#d93232" transparent opacity={0.95} wireframe />
      </mesh>
    </group>
  )
}

function ContainerFrame({
  length,
  width,
  height,
  showFill,
}: {
  length: number
  width: number
  height: number
  showFill: boolean
}) {
  return (
    <group>
      {showFill ? (
        <mesh position={[0, height / 2, 0]}>
          <boxGeometry args={[length, height, width]} />
          <meshStandardMaterial
            color="#cebfa5"
            metalness={0.02}
            roughness={0.92}
            transparent
            opacity={0.16}
          />
        </mesh>
      ) : null}
      <mesh position={[0, height / 2, 0]}>
        <boxGeometry args={[length, height, width]} />
        <meshBasicMaterial color="#2d251c" transparent opacity={0.68} wireframe />
      </mesh>
    </group>
  )
}

function getCameraPosition(viewPreset: ViewPreset, height: number): [number, number, number] {
  switch (viewPreset) {
    case 'top':
      return [0.01, Math.max(height * 4.3, 8), 0.01]
    case 'side':
      return [13.5, Math.max(height * 1.35, 3.4), 0]
    default:
      return [7.5, 6.2, 9.5]
  }
}

function Placeholder() {
  return (
    <mesh position={[0, 1.2, 0]}>
      <boxGeometry args={[4.8, 2.4, 2.4]} />
      <meshStandardMaterial color="#d9cfbd" transparent opacity={0.35} />
    </mesh>
  )
}

function getBoxMaterialProps(
  packagingVisualType: string,
  color: string,
  isFocused: boolean,
  isActive: boolean,
) {
  const base = {
    color,
    emissive: isFocused ? '#ffad63' : isActive ? '#f1c486' : '#000000',
    emissiveIntensity: isFocused ? 0.55 : isActive ? 0.18 : 0,
    metalness: 0.04,
    roughness: 0.48,
  }

  switch (packagingVisualType) {
    case 'foam':
      return {
        ...base,
        transparent: true,
        opacity: 0.5,
      }
    case 'paper':
      return {
        ...base,
        transparent: false,
        opacity: 1,
        roughness: 0.92,
      }
    case 'wood_crate':
      return {
        ...base,
        metalness: 0.02,
        roughness: 0.88,
      }
    case 'wood_frame':
      return {
        ...base,
        transparent: true,
        opacity: 0.08,
        roughness: 0.95,
      }
    default:
      return base
  }
}

function FramePosts({
  box,
}: {
  box: {
    size: { x: number; y: number; z: number }
    accentColor: string
  }
}) {
  const postThickness = Math.max(Math.min(box.size.x, box.size.y, box.size.z) * 0.035, 0.02)
  const x = box.size.x / 2 - postThickness / 2
  const y = box.size.y / 2
  const z = box.size.z / 2 - postThickness / 2
  const positions: Array<[number, number, number]> = [
    [x, y, z],
    [x, y, -z],
    [-x, y, z],
    [-x, y, -z],
  ]

  return (
    <group>
      {positions.map((position, index) => (
        <mesh key={index} position={position}>
          <boxGeometry args={[postThickness, box.size.y, postThickness]} />
          <meshStandardMaterial color={box.accentColor} metalness={0.02} roughness={0.94} />
        </mesh>
      ))}
    </group>
  )
}

function CrateStraps({
  box,
}: {
  box: {
    size: { x: number; y: number; z: number }
    accentColor: string
  }
}) {
  const strapThickness = Math.max(Math.min(box.size.x, box.size.z) * 0.02, 0.015)
  const y = box.size.y / 2 + strapThickness / 2
  const xOffsets = [-0.25, 0.25].map((ratio) => ratio * box.size.x)
  const zOffsets = [-0.25, 0.25].map((ratio) => ratio * box.size.z)

  return (
    <group>
      {xOffsets.map((offset, index) => (
        <mesh key={`x-${index}`} position={[offset, y, 0]}>
          <boxGeometry args={[strapThickness, box.size.y * 1.01, box.size.z * 1.01]} />
          <meshStandardMaterial color={box.accentColor} metalness={0.04} roughness={0.84} />
        </mesh>
      ))}
      {zOffsets.map((offset, index) => (
        <mesh key={`z-${index}`} position={[0, y, offset]}>
          <boxGeometry args={[box.size.x * 1.01, box.size.y * 1.01, strapThickness]} />
          <meshStandardMaterial color={box.accentColor} metalness={0.04} roughness={0.84} />
        </mesh>
      ))}
    </group>
  )
}

function CartonBands({
  box,
}: {
  box: {
    size: { x: number; y: number; z: number }
    accentColor: string
  }
}) {
  const bandThickness = Math.max(Math.min(box.size.x, box.size.z) * 0.012, 0.012)
  const y = box.size.y / 2 + bandThickness / 2

  return (
    <group>
      <mesh position={[0, y, 0]}>
        <boxGeometry args={[box.size.x * 1.01, bandThickness, box.size.z * 1.01]} />
        <meshStandardMaterial color={box.accentColor} metalness={0.02} roughness={0.92} />
      </mesh>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[bandThickness, box.size.y * 1.01, box.size.z * 1.01]} />
        <meshStandardMaterial color={box.accentColor} metalness={0.02} roughness={0.92} />
      </mesh>
    </group>
  )
}

function BoxNumberLabel({
  box,
}: {
  box: {
    boxNo: string
    size: { x: number; y: number; z: number }
  }
}) {
  const fontSize = Math.max(Math.min(box.size.x, box.size.y, box.size.z) * 0.18, 0.16)
  const frontOffset = box.size.z / 2 + 0.01
  const sideOffset = box.size.x / 2 + 0.01

  return (
    <>
      <Text
        anchorX="center"
        anchorY="middle"
        color="#d9534f"
        fontSize={fontSize}
        maxWidth={Math.max(box.size.x * 0.7, fontSize)}
        outlineColor="#fff8f2"
        outlineWidth={fontSize * 0.08}
        position={[0, 0, frontOffset]}
        renderOrder={10}
      >
        {box.boxNo}
      </Text>
      <Text
        anchorX="center"
        anchorY="middle"
        color="#d9534f"
        fontSize={fontSize * 0.88}
        maxWidth={Math.max(box.size.z * 0.7, fontSize)}
        outlineColor="#fff8f2"
        outlineWidth={fontSize * 0.08}
        position={[sideOffset, 0, 0]}
        renderOrder={10}
        rotation={[0, Math.PI / 2, 0]}
      >
        {box.boxNo}
      </Text>
    </>
  )
}
