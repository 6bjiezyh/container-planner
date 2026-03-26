import { describe, expect, it } from 'vitest'
import {
  applyPackagingRule,
  calculateContainerPlan,
  calculateContainerPlanWithSequence,
  calculateMultiContainerPlan,
  calculateItemCbm,
  estimatePlacementCount,
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

  it('keeps entered outer carton size but still allows wood packaging expansion in outer box mode', () => {
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
        lengthCm: 67,
        widthCm: 31,
        heightCm: 53,
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

  it('treats outer-box packing list rows as box-count placements instead of product quantity placements', () => {
    const plan = calculateContainerPlan({
      containerType: '20GP',
      items: [
        {
          id: 'SKU-BOX',
          label: '外箱货物',
          lengthCm: 120,
          widthCm: 80,
          heightCm: 100,
          quantity: 10,
          boxCount: 2,
          boxNo: 'A01-A02',
          packagingType: 'none',
          dimensionInputMode: 'outer_box',
          fragile: false,
          cartonEnabled: false,
          cartonThicknessCm: 0,
          foamEnabled: false,
          foamThicknessCm: 0,
        },
      ],
    })

    expect(plan.summary.totalUnits).toBe(2)
    expect(plan.placements).toHaveLength(2)
    expect(plan.placements.map((placement) => placement.boxNo)).toEqual(['A01', 'A02'])
    expect(plan.placements.map((placement) => placement.declaredQuantity)).toEqual([5, 5])
  })

  it('estimates calculation workload from box count for outer-box rows', () => {
    expect(
      estimatePlacementCount([
        {
          id: 'SKU-BOX',
          label: '外箱货物',
          lengthCm: 120,
          widthCm: 80,
          heightCm: 100,
          quantity: 10,
          boxCount: 2,
          packagingType: 'none',
          dimensionInputMode: 'outer_box',
          fragile: false,
          cartonEnabled: false,
          cartonThicknessCm: 0,
          foamEnabled: false,
          foamThicknessCm: 0,
        },
        {
          id: 'SKU-EST',
          label: '估算货物',
          lengthCm: 60,
          widthCm: 40,
          heightCm: 30,
          quantity: 3,
          packagingType: 'none',
          dimensionInputMode: 'estimate',
          fragile: false,
          cartonEnabled: false,
          cartonThicknessCm: 0,
          foamEnabled: false,
          foamThicknessCm: 0,
        },
      ]),
    ).toBe(5)
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

  it('allows stable stacking and keeps heavier cargo below lighter cargo when floor space is limited', () => {
    const plan = calculateContainerPlan({
      containerType: 'CUSTOM',
      customContainer: {
        lengthCm: 200,
        widthCm: 100,
        heightCm: 220,
      },
      items: [
        {
          id: 'SKU-0',
          label: '重底货',
          lengthCm: 100,
          widthCm: 100,
          heightCm: 100,
          quantity: 1,
          packagingType: 'none',
          dimensionInputMode: 'estimate',
          fragile: false,
          singleWeightKg: 120,
          cartonEnabled: false,
          foamEnabled: false,
          cartonThicknessCm: 0,
          foamThicknessCm: 0,
        },
        {
          id: 'SKU-1',
          label: '次重底货',
          lengthCm: 100,
          widthCm: 100,
          heightCm: 100,
          quantity: 1,
          packagingType: 'none',
          dimensionInputMode: 'estimate',
          fragile: false,
          singleWeightKg: 90,
          cartonEnabled: false,
          foamEnabled: false,
          cartonThicknessCm: 0,
          foamThicknessCm: 0,
        },
        {
          id: 'SKU-2',
          label: '轻顶货 A',
          lengthCm: 100,
          widthCm: 100,
          heightCm: 70,
          quantity: 1,
          packagingType: 'none',
          dimensionInputMode: 'estimate',
          fragile: false,
          singleWeightKg: 15,
          cartonEnabled: false,
          foamEnabled: false,
          cartonThicknessCm: 0,
          foamThicknessCm: 0,
        },
        {
          id: 'SKU-3',
          label: '轻顶货 B',
          lengthCm: 100,
          widthCm: 100,
          heightCm: 60,
          quantity: 1,
          packagingType: 'none',
          dimensionInputMode: 'estimate',
          fragile: false,
          singleWeightKg: 10,
          cartonEnabled: false,
          foamEnabled: false,
          cartonThicknessCm: 0,
          foamThicknessCm: 0,
        },
      ],
    })

    expect(plan.fits).toBe(true)
    expect(plan.placements).toHaveLength(4)
    expect(plan.placements.some((placement) => placement.zCm > 0)).toBe(true)

    const heaviest = plan.placements.find((placement) => placement.itemId === 'SKU-0')
    const lightest = plan.placements.find((placement) => placement.itemId === 'SKU-3')

    expect(heaviest?.zCm ?? 999).toBe(0)
    expect((lightest?.zCm ?? 0) >= (heaviest?.zCm ?? 0)).toBe(true)
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

  it('can prioritize third-party cargo first when separating supplier batches', () => {
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

    const thirdPartyFirst = calculateMultiContainerPlan({
      containerType: '20GP',
      items,
      splitMode: 'separate_suppliers',
      loadPriority: 'other_first',
    })

    expect(
      thirdPartyFirst.batches[0].plan.placements.every(
        (placement) => placement.supplierFlag === 'other',
      ),
    ).toBe(true)
    expect(
      thirdPartyFirst.batches[1].plan.placements.every(
        (placement) => placement.supplierFlag === 'self',
      ),
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

  it('packs only inside the declared remaining entrance space', () => {
    const plan = calculateContainerPlan({
      containerType: '40HQ',
      remainingSpace: {
        enabled: true,
        lengthCm: 300,
        widthCm: 200,
        heightCm: 200,
      },
      items: [
        {
          id: 'SKU-RS',
          label: '入口剩余空间测试货物',
          lengthCm: 100,
          widthCm: 80,
          heightCm: 90,
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

    expect(plan.packingSpace.lengthCm).toBe(300)
    expect(plan.packingSpace.widthCm).toBe(200)
    expect(plan.packingSpace.heightCm).toBe(200)
    expect(plan.packingSpace.originXCm).toBe(903)
    expect(
      plan.placements.every(
        (placement) =>
          placement.xCm + placement.lengthCm <= plan.packingSpace.lengthCm &&
          placement.yCm + placement.widthCm <= plan.packingSpace.widthCm &&
          placement.zCm + placement.heightCm <= plan.packingSpace.heightCm,
      ),
    ).toBe(true)
  })
})
