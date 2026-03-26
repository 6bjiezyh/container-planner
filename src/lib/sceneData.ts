import type { ContainerPlan, PackagingVisualType } from './containerPlanner'

export interface SceneBox {
  id: string
  label: string
  dimensionLabel: string
  piNo: string
  boxNo: string
  packagingVisualType: PackagingVisualType
  size: { x: number; y: number; z: number }
  position: { x: number; y: number; z: number }
  color: string
  layer: number
}

export interface SceneData {
  container: {
    length: number
    width: number
    height: number
    label: string
    dimensionLabel: string
  }
  boxes: SceneBox[]
  scale: number
}

export function createSceneData(plan: ContainerPlan): SceneData {
  const scale = 10 / plan.container.lengthCm

  return {
    scale,
    container: {
      length: plan.container.lengthCm * scale,
      width: plan.container.widthCm * scale,
      height: plan.container.heightCm * scale,
      label: `${plan.containerType === 'CUSTOM' ? '自定义' : plan.containerType} 货柜`,
      dimensionLabel: `${plan.container.lengthCm}×${plan.container.widthCm}×${plan.container.heightCm}cm`,
    },
    boxes: plan.placements.map((placement, index) => {
      const sizeX = placement.lengthCm * scale
      const sizeZ = placement.widthCm * scale
      const sizeY = placement.heightCm * scale

      return {
        id: `${placement.itemId}-${placement.index}`,
        label: placement.label,
        dimensionLabel: `${placement.lengthCm}×${placement.widthCm}×${placement.heightCm}cm`,
        piNo: placement.piNo,
        boxNo: placement.boxNo,
        packagingVisualType: placement.packagingVisualType,
        size: {
          x: sizeX,
          y: sizeY,
          z: sizeZ,
        },
        position: {
          x:
            -5 +
            placement.xCm * scale +
            sizeX / 2,
          y: sizeY / 2 + placement.zCm * scale,
          z:
            -((plan.container.widthCm * scale) / 2) +
            placement.yCm * scale +
            sizeZ / 2,
        },
        color: getBoxColor(placement.packagingVisualType, index),
        layer: placement.layer,
      }
    }),
  }
}

function getBoxColor(type: PackagingVisualType, index: number) {
  switch (type) {
    case 'foam':
      return `hsl(${200 + ((index * 11) % 12)} 72% ${74 - (index % 2) * 8}%)`
    case 'paper':
      return `hsl(${30 + ((index * 7) % 8)} 14% ${78 - (index % 2) * 10}%)`
    case 'wood_crate':
      return `hsl(${28 + ((index * 9) % 10)} 48% ${48 - (index % 2) * 7}%)`
    case 'wood_frame':
      return `hsl(${32 + ((index * 8) % 6)} 36% ${62 - (index % 2) * 6}%)`
    default:
      return `hsl(${0 + ((index * 9) % 10)} 0% ${88 - (index % 2) * 8}%)`
  }
}
