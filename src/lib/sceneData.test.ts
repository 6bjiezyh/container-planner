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
    expect(scene.boxes[1].position.x).toBeGreaterThan(scene.boxes[0].position.x)
    expect(scene.container.label).toContain('20GP')
    expect(scene.boxes[0].dimensionLabel).toContain('126×86×111')
  })
})
