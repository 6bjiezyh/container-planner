import { describe, expect, it } from 'vitest'
import {
  applyPackagingRule,
  calculateContainerPlan,
  calculateContainerPlanWithSequence,
  calculateMultiContainerPlan,
  calculateItemCbm,
  generateContainerPlanCandidates,
  nudgePlacementInPlan,
  resolveItemDimensions,
} from './containerPlanner'

describe('container planner rules', () => {
  it('calculates bare cargo cbm from centimeter dimensions', () => {
    expect(
      calculateItemCbm({
        lengthCm: 120,
        widthCm: 80,
        heightCm: 100,
        quantity: 10,
      }),
    ).toBeCloseTo(9.6, 5)
  })

  it('applies wood crate expansion with fixed outer dimensions', () => {
    expect(
      applyPackagingRule({
        lengthCm: 120,
        widthCm: 80,
        heightCm: 100,
        packagingType: 'wood_crate',
      }),
    ).toEqual({
      lengthCm: 132,
      widthCm: 92,
      heightCm: 117,
    })
  })

  it('keeps entered dimensions as packed dimensions when outer box mode is used', () => {
    expect(
      resolveItemDimensions({
        id: 'SKU-OUTER',
        label: '直接填写外箱',
        lengthCm: 61,
        widthCm: 25,
        heightCm: 42,
        quantity: 1,
        packagingType: 'wood_crate',
        dimensionInputMode: 'outer_box',
        fragile: false,
        cartonEnabled: true,
        cartonThicknessCm: 1.2,
        foamEnabled: true,
        foamThicknessCm: 2,
      }),
    ).toEqual({
      input: {
        lengthCm: 61,
        widthCm: 25,
        heightCm: 42,
      },
      packed: {
        lengthCm: 61,
        widthCm: 25,
        heightCm: 42,
      },
    })
  })

  it('estimates outer carton dimensions from product size plus wood, carton, and foam thickness', () => {
    expect(
      resolveItemDimensions({
        id: 'SKU-EST',
        label: '定制纸箱估算',
        lengthCm: 100,
        widthCm: 80,
        heightCm: 60,
        quantity: 1,
        packagingType: 'wood_frame',
        dimensionInputMode: 'estimate',
        fragile: true,
        cartonEnabled: true,
        cartonThicknessCm: 1,
        foamEnabled: true,
        foamThicknessCm: 2,
      }),
    ).toEqual({
      input: {
        lengthCm: 100,
        widthCm: 80,
        heightCm: 60,
      },
      packed: {
        lengthCm: 110,
        widthCm: 90,
        heightCm: 75,
      },
    })
  })

  it('returns a feasible plan for a simple 20GP load', () => {
    const plan = calculateContainerPlan({
      containerType: '20GP',
      items: [
        {
          id: 'SKU-001',
          label: 'Dining cabinet',
          lengthCm: 120,
          widthCm: 80,
          heightCm: 100,
          quantity: 8,
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

    expect(plan.fits).toBe(true)
    expect(plan.summary.totalUnits).toBe(8)
    expect(plan.summary.utilizationRatio).toBeGreaterThan(0)
    expect(plan.placements).toHaveLength(8)
  })

  it('searches across strategies instead of stopping at the first greedy packing order', () => {
    const plan = calculateContainerPlan({
      containerType: '20GP',
      items: [
        {
          id: 'SKU-A',
          label: '货物 A',
          lengthCm: 220,
          widthCm: 180,
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
        {
          id: 'SKU-B',
          label: '货物 B',
          lengthCm: 160,
          widthCm: 60,
          heightCm: 80,
          quantity: 1,
          packagingType: 'none',
          dimensionInputMode: 'estimate',
          fragile: false,
          cartonEnabled: false,
          foamEnabled: false,
          cartonThicknessCm: 0,
          foamThicknessCm: 0,
        },
        {
          id: 'SKU-C',
          label: '货物 C',
          lengthCm: 240,
          widthCm: 100,
          heightCm: 140,
          quantity: 1,
          packagingType: 'none',
          dimensionInputMode: 'estimate',
          fragile: false,
          cartonEnabled: false,
          foamEnabled: false,
          cartonThicknessCm: 0,
          foamThicknessCm: 0,
        },
        {
          id: 'SKU-D',
          label: '货物 D',
          lengthCm: 240,
          widthCm: 120,
          heightCm: 160,
          quantity: 1,
          packagingType: 'none',
          dimensionInputMode: 'estimate',
          fragile: false,
          cartonEnabled: false,
          foamEnabled: false,
          cartonThicknessCm: 0,
          foamThicknessCm: 0,
        },
      ],
    })

    expect(plan.fits).toBe(true)
    expect(plan.summary.unpackedItems).toBe(0)
    expect(plan.placements).toHaveLength(4)
  })

  it('prefers filling the floor before creating a new upper layer when the base still has room', () => {
    const plan = calculateContainerPlan({
      containerType: '40HQ',
      items: [
        {
          id: 'SKU-0',
          label: '货物 0',
          lengthCm: 160,
          widthCm: 130,
          heightCm: 60,
          quantity: 1,
          packagingType: 'none',
          dimensionInputMode: 'estimate',
          fragile: false,
          cartonEnabled: false,
          foamEnabled: false,
          cartonThicknessCm: 0,
          foamThicknessCm: 0,
        },
        {
          id: 'SKU-1',
          label: '货物 1',
          lengthCm: 320,
          widthCm: 50,
          heightCm: 40,
          quantity: 1,
          packagingType: 'none',
          dimensionInputMode: 'estimate',
          fragile: false,
          cartonEnabled: false,
          foamEnabled: false,
          cartonThicknessCm: 0,
          foamThicknessCm: 0,
        },
        {
          id: 'SKU-2',
          label: '货物 2',
          lengthCm: 80,
          widthCm: 60,
          heightCm: 160,
          quantity: 1,
          packagingType: 'none',
          dimensionInputMode: 'estimate',
          fragile: false,
          cartonEnabled: false,
          foamEnabled: false,
          cartonThicknessCm: 0,
          foamThicknessCm: 0,
        },
        {
          id: 'SKU-3',
          label: '货物 3',
          lengthCm: 260,
          widthCm: 40,
          heightCm: 80,
          quantity: 1,
          packagingType: 'none',
          dimensionInputMode: 'estimate',
          fragile: false,
          cartonEnabled: false,
          foamEnabled: false,
          cartonThicknessCm: 0,
          foamThicknessCm: 0,
        },
        {
          id: 'SKU-4',
          label: '货物 4',
          lengthCm: 120,
          widthCm: 180,
          heightCm: 60,
          quantity: 1,
          packagingType: 'none',
          dimensionInputMode: 'estimate',
          fragile: false,
          cartonEnabled: false,
          foamEnabled: false,
          cartonThicknessCm: 0,
          foamThicknessCm: 0,
        },
        {
          id: 'SKU-5',
          label: '货物 5',
          lengthCm: 260,
          widthCm: 90,
          heightCm: 120,
          quantity: 1,
          packagingType: 'none',
          dimensionInputMode: 'estimate',
          fragile: false,
          cartonEnabled: false,
          foamEnabled: false,
          cartonThicknessCm: 0,
          foamThicknessCm: 0,
        },
        {
          id: 'SKU-6',
          label: '货物 6',
          lengthCm: 400,
          widthCm: 210,
          heightCm: 40,
          quantity: 1,
          packagingType: 'none',
          dimensionInputMode: 'estimate',
          fragile: false,
          cartonEnabled: false,
          foamEnabled: false,
          cartonThicknessCm: 0,
          foamThicknessCm: 0,
        },
      ],
    })

    expect(plan.fits).toBe(true)
    expect(plan.placements).toHaveLength(7)
    expect(plan.placements.every((placement) => placement.zCm === 0)).toBe(true)
  })

  it('respects an explicit unit order when building an alternative packing plan', () => {
    const items = [
      {
        id: 'SKU-A',
        label: '货物 A',
        lengthCm: 120,
        widthCm: 80,
        heightCm: 100,
        quantity: 2,
        packagingType: 'none' as const,
        dimensionInputMode: 'estimate' as const,
        fragile: false,
        cartonEnabled: false,
        cartonThicknessCm: 0,
        foamEnabled: false,
        foamThicknessCm: 0,
      },
      {
        id: 'SKU-B',
        label: '货物 B',
        lengthCm: 90,
        widthCm: 90,
        heightCm: 110,
        quantity: 1,
        packagingType: 'none' as const,
        dimensionInputMode: 'estimate' as const,
        fragile: false,
        cartonEnabled: false,
        cartonThicknessCm: 0,
        foamEnabled: false,
        foamThicknessCm: 0,
      },
    ]

    const plan = calculateContainerPlanWithSequence({
      containerType: '20GP',
      items,
      orderedUnitKeys: ['SKU-B-0', 'SKU-A-0', 'SKU-A-1'],
    })

    expect(plan.placements).toHaveLength(3)
    expect(plan.placements[0].itemId).toBe('SKU-B')
    expect(plan.placements[0].index).toBe(0)
  })

  it('generates multiple candidate plans so qwen can choose among alternatives', () => {
    const items = [
      {
        id: 'SKU-A',
        label: '货物 A',
        lengthCm: 220,
        widthCm: 180,
        heightCm: 60,
        quantity: 1,
        packagingType: 'none' as const,
        dimensionInputMode: 'estimate' as const,
        fragile: false,
        cartonEnabled: false,
        cartonThicknessCm: 0,
        foamEnabled: false,
        foamThicknessCm: 0,
      },
      {
        id: 'SKU-B',
        label: '货物 B',
        lengthCm: 160,
        widthCm: 60,
        heightCm: 80,
        quantity: 1,
        packagingType: 'none' as const,
        dimensionInputMode: 'estimate' as const,
        fragile: false,
        cartonEnabled: false,
        foamEnabled: false,
        cartonThicknessCm: 0,
        foamThicknessCm: 0,
      },
      {
        id: 'SKU-C',
        label: '货物 C',
        lengthCm: 240,
        widthCm: 100,
        heightCm: 140,
        quantity: 1,
        packagingType: 'none' as const,
        dimensionInputMode: 'estimate' as const,
        fragile: false,
        cartonEnabled: false,
        foamEnabled: false,
        cartonThicknessCm: 0,
        foamThicknessCm: 0,
      },
      {
        id: 'SKU-D',
        label: '货物 D',
        lengthCm: 240,
        widthCm: 120,
        heightCm: 160,
        quantity: 1,
        packagingType: 'none' as const,
        dimensionInputMode: 'estimate' as const,
        fragile: false,
        cartonEnabled: false,
        foamEnabled: false,
        cartonThicknessCm: 0,
        foamThicknessCm: 0,
      },
    ]

    const candidates = generateContainerPlanCandidates({
      containerType: '20GP',
      items,
    })

    expect(candidates.length).toBeGreaterThan(1)
    expect(new Set(candidates.map((candidate) => candidate.candidateId)).size).toBe(candidates.length)
    expect(candidates[0].plan.fits).toBe(true)
  })

  it('does not stack cargo on top of a fragile item even when height would allow it', () => {
    const plan = calculateContainerPlanWithSequence({
      containerType: 'AIR_PALLET',
      orderedUnitKeys: ['FRAGILE-BASE-0', 'TOP-BOX-0'],
      items: [
        {
          id: 'FRAGILE-BASE',
          label: '易碎底件',
          lengthCm: 120,
          widthCm: 80,
          heightCm: 60,
          quantity: 1,
          packagingType: 'none',
          dimensionInputMode: 'estimate',
          fragile: true,
          cartonEnabled: false,
          cartonThicknessCm: 0,
          foamEnabled: false,
          foamThicknessCm: 0,
        },
        {
          id: 'TOP-BOX',
          label: '上层货物',
          lengthCm: 120,
          widthCm: 80,
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

    expect(plan.placements).toHaveLength(1)
    expect(plan.summary.unpackedItems).toBe(1)
    expect(plan.placements[0].fragile).toBe(true)
  })

  it('can separate self-owned and third-party cargo into different containers when requested', () => {
    const items = [
      {
        id: 'SELF-1',
        label: '己方货物',
        lengthCm: 120,
        widthCm: 80,
        heightCm: 90,
        quantity: 1,
        packagingType: 'none' as const,
        dimensionInputMode: 'estimate' as const,
        fragile: false,
        cartonEnabled: false,
        cartonThicknessCm: 0,
        foamEnabled: false,
        foamThicknessCm: 0,
        supplierFlag: 'self' as const,
      },
      {
        id: 'OTHER-1',
        label: '第三方货物',
        lengthCm: 120,
        widthCm: 80,
        heightCm: 90,
        quantity: 1,
        packagingType: 'none' as const,
        dimensionInputMode: 'estimate' as const,
        fragile: false,
        cartonEnabled: false,
        cartonThicknessCm: 0,
        foamEnabled: false,
        foamThicknessCm: 0,
        supplierFlag: 'other' as const,
      },
    ]

    const mixedPlan = calculateMultiContainerPlan({
      containerType: '20GP',
      items,
      splitMode: 'mixed',
    })
    const separatedPlan = calculateMultiContainerPlan({
      containerType: '20GP',
      items,
      splitMode: 'separate_suppliers',
    })

    expect(mixedPlan.summary.totalContainers).toBe(1)
    expect(separatedPlan.summary.totalContainers).toBe(2)
    expect(
      separatedPlan.batches[0].plan.placements.every((placement) => placement.supplierFlag === 'self'),
    ).toBe(true)
    expect(
      separatedPlan.batches[1].plan.placements.every((placement) => placement.supplierFlag === 'other'),
    ).toBe(true)
  })

  it('supports manual placement nudging only when the adjusted position remains valid', () => {
    const plan = calculateContainerPlan({
      containerType: '20GP',
      items: [
        {
          id: 'SKU-001',
          label: '货物 A',
          lengthCm: 120,
          widthCm: 80,
          heightCm: 100,
          quantity: 2,
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

    const placementId = `${plan.placements[1].itemId}-${plan.placements[1].index}`
    const nudgedPlan = nudgePlacementInPlan({
      plan,
      placementId,
      axis: 'xCm',
      deltaCm: 20,
    })

    expect(nudgedPlan).not.toBeNull()
    expect(nudgedPlan?.placements[1].xCm).toBe(plan.placements[1].xCm + 20)

    const invalidPlan = nudgePlacementInPlan({
      plan,
      placementId,
      axis: 'yCm',
      deltaCm: -200,
    })

    expect(invalidPlan).toBeNull()
  })
})
