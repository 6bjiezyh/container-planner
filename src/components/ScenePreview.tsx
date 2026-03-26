import { useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
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
  const focusedBox = visibleBoxes.find((box) => box.id === focusedId) ?? null
  const cameraPosition = getCameraPosition(viewPreset, scene?.container.height ?? 2.4)

  return (
    <div className="scene-shell">
      {scene ? (
        <>
          <div className="scene-hud scene-hud-container">
            <strong>{scene.container.label}</strong>
            <span>{scene.container.dimensionLabel}</span>
          </div>
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
          {focusedBox ? (
            <div className="scene-hud scene-hud-box">
              <strong>{focusedBox.label}</strong>
              {focusedBox.piNo || focusedBox.boxNo ? (
                <span>
                  {focusedBox.piNo ? `PI ${focusedBox.piNo}` : ''}
                  {focusedBox.piNo && focusedBox.boxNo ? ' · ' : ''}
                  {focusedBox.boxNo ? `箱号 ${focusedBox.boxNo}` : ''}
                </span>
              ) : null}
              <span>{focusedBox.dimensionLabel}</span>
            </div>
          ) : null}
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
                  <meshStandardMaterial {...getBoxMaterialProps(box.packagingVisualType, box.color, box.id === focusedId, box.id === activePlacementId)} />
                </mesh>
                {box.packagingVisualType === 'wood_frame' ? (
                  <mesh>
                    <boxGeometry args={[box.size.x * 1.005, box.size.y * 1.005, box.size.z * 1.005]} />
                    <meshBasicMaterial color="#6d5337" wireframe />
                  </mesh>
                ) : null}
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
        opacity: 0.55,
      }
    case 'paper':
      return {
        ...base,
        transparent: false,
        opacity: 1,
      }
    case 'wood_crate':
      return {
        ...base,
        metalness: 0.02,
        roughness: 0.82,
      }
    case 'wood_frame':
      return {
        ...base,
        transparent: true,
        opacity: 0.16,
      }
    default:
      return base
  }
}
