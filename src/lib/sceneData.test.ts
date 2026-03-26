import { describe, expect, it } from 'vitest'
import { calculateContainerPlan } from './containerPlanner'
import { createSceneData } from './sceneData'

describe('scene data conversion', () => {
  it('converts a container plan into normalized 3d scene dimensions', () => {
    const plan = calculateContainerPlan({
      containerType: '20GP',
      items: [
        {
          id: 'SKU-3D',
          label: 'Cabinet',
          lengthCm: 120,
          widthCm: 80,
          heightCm: 100,
          quantity: 2,
          packagingType: 'wood_crate',
          dimensionInputMode: 'estimate',
          fragile: false,
          cartonEnabled: false,
          cartonThicknessCm: 0,
          foamEnabled: false,
          foamThicknessCm: 0,
        },
      ],
    })

    const scene = createSceneData(plan)

    expect(scene.container.length).toBeCloseTo(10, 5)
    expect(scene.boxes).toHaveLength(2)
    expect(scene.boxes[0].size.x).toBeGreaterThan(0)
    expect(scene.boxes[0].position.y).toBeGreaterThan(0)
    expect(scene.boxes[1].position.x).toBeGreaterThanOrEqual(scene.boxes[0].position.x)
    expect(scene.container.label).toContain('20GP')
    expect(scene.boxes[0].dimensionLabel).toMatch(/(126×86×111|86×126×111)cm/)
  })

  it('offsets box positions when only the entrance remaining space is available', () => {
    const plan = calculateContainerPlan({
      containerType: '20GP',
      remainingSpace: {
        enabled: true,
        lengthCm: 200,
        widthCm: 200,
        heightCm: 200,
      },
      items: [
        {
          id: 'SKU-RS',
          label: '剩余空间货物',
          lengthCm: 80,
          widthCm: 60,
          heightCm: 60,
          quantity: 1,
          packagingType: 'none',
          dimensionInputMode: 'estimate',
          fragile: false,
          cartonEnabled: false,
          cartonThicknessCm: 0,
          foamEnabled: false,
          foamThicknessCm: 0,
        },
      ],
    })

    const scene = createSceneData(plan)

    expect(scene.packingSpace.dimensionLabel).toBe('200×200×200cm')
    expect(scene.packingSpace.x).toBeGreaterThan(-5)
    expect(scene.boxes[0].position.x).toBeGreaterThan(scene.packingSpace.x)
  })
})
