import type { ContainerPlan, PackagingVisualType } from './containerPlanner'

export interface SceneBox {
  id: string
  label: string
  dimensionLabel: string
  productCode: string
  piNo: string
  boxNo: string
  packagingVisualType: PackagingVisualType
  size: { x: number; y: number; z: number }
  position: { x: number; y: number; z: number }
  color: string
  accentColor: string
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
  packingSpace: {
    length: number
    width: number
    height: number
    x: number
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
    packingSpace: {
      length: plan.packingSpace.lengthCm * scale,
      width: plan.packingSpace.widthCm * scale,
      height: plan.packingSpace.heightCm * scale,
      x: -5 + plan.packingSpace.originXCm * scale,
      label: plan.packingSpace.label,
      dimensionLabel: `${plan.packingSpace.lengthCm}×${plan.packingSpace.widthCm}×${plan.packingSpace.heightCm}cm`,
    },
    boxes: plan.placements.map((placement, index) => {
      const sizeX = placement.lengthCm * scale
      const sizeZ = placement.widthCm * scale
      const sizeY = placement.heightCm * scale
      const appearance = getBoxAppearance(placement.packagingVisualType, index)

      return {
        id: `${placement.itemId}-${placement.index}`,
        label: placement.label,
        dimensionLabel: `${placement.lengthCm}×${placement.widthCm}×${placement.heightCm}cm`,
        productCode: placement.productCode,
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
            plan.packingSpace.originXCm * scale +
            placement.xCm * scale +
            sizeX / 2,
          y: sizeY / 2 + placement.zCm * scale,
          z:
            -((plan.container.widthCm * scale) / 2) +
            placement.yCm * scale +
            sizeZ / 2,
        },
        color: appearance.fill,
        accentColor: appearance.accent,
        layer: placement.layer,
      }
    }),
  }
}

function getBoxAppearance(type: PackagingVisualType, index: number) {
  const pick = <T,>(items: T[]) => items[index % items.length]

  switch (type) {
    case 'foam':
      return pick([
        { fill: '#9fd3ff', accent: '#4a86c5' },
        { fill: '#8dc1f3', accent: '#336fba' },
        { fill: '#b1dcff', accent: '#5e98cf' },
        { fill: '#7fb6ea', accent: '#2f6cab' },
      ])
    case 'paper':
      return pick([
        { fill: '#d8c1a3', accent: '#9d7e58' },
        { fill: '#ccb08d', accent: '#8e6c45' },
        { fill: '#e1ccb1', accent: '#ab8760' },
        { fill: '#c7aa84', accent: '#7d5d39' },
      ])
    case 'wood_crate':
      return pick([
        { fill: '#b37a46', accent: '#6f4622' },
        { fill: '#9f6b3f', accent: '#5f391a' },
        { fill: '#c18852', accent: '#7e522a' },
        { fill: '#8f5d34', accent: '#553113' },
      ])
    case 'wood_frame':
      return pick([
        { fill: '#e0c9ae', accent: '#7b5631' },
        { fill: '#d6bca0', accent: '#6d4927' },
        { fill: '#e8d6c0', accent: '#8e6238' },
        { fill: '#ccb08e', accent: '#704b28' },
      ])
    default:
      return pick([
        { fill: '#d8d8d8', accent: '#7d7d7d' },
        { fill: '#c9c9c9', accent: '#666666' },
        { fill: '#e2e2e2', accent: '#8a8a8a' },
        { fill: '#bdbdbd', accent: '#585858' },
      ])
  }
}
