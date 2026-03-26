export type ContainerType =
  | '4.2M_TRUCK'
  | '6.8M_TRUCK'
  | '9.6M_TRUCK'
  | '20GP'
  | '40GP'
  | '40HQ'
  | 'CUSTOM'
  | 'AIR_PALLET'
  | 'AIR_BULK'

export type PackagingType = 'none' | 'wood_frame' | 'wood_crate'
export type DimensionInputMode = 'outer_box' | 'estimate'
export type SupplierFlag = 'self' | 'other'
export type PackagingVisualType = 'none' | 'foam' | 'paper' | 'wood_frame' | 'wood_crate'
export type SplitMode = 'mixed' | 'separate_suppliers'
export type LoadPriority = 'self_first' | 'other_first' | 'balanced'

export interface ItemInput {
  id: string
  label: string
  piNo?: string
  productCode?: string
  boxNo?: string
  boxCount?: number
  singleWeightKg?: number
  orderId?: string
  supplierFlag?: SupplierFlag
  lengthCm: number
  widthCm: number
  heightCm: number
  quantity: number
  packagingType: PackagingType
  dimensionInputMode: DimensionInputMode
  fragile: boolean
  cartonEnabled: boolean
  cartonThicknessCm: number
  foamEnabled: boolean
  foamThicknessCm: number
  woodThicknessCm?: number
}

export interface CbmInput {
  lengthCm: number
  widthCm: number
  heightCm: number
  quantity?: number
}

export interface Dimension3D {
  lengthCm: number
  widthCm: number
  heightCm: number
}

export interface RemainingSpaceInput extends Dimension3D {
  enabled: boolean
}

export interface PackingSpace extends Dimension3D {
  originXCm: number
  label: string
}

export interface Placement {
  itemId: string
  label: string
  index: number
  fragile: boolean
  supplierFlag: SupplierFlag
  singleWeightKg: number
  productCode: string
  boxNo: string
  boxCount: number
  declaredQuantity: number
  piNo: string
  packagingVisualType: PackagingVisualType
  lengthCm: number
  widthCm: number
  heightCm: number
  xCm: number
  yCm: number
  zCm: number
  rotation: 'default' | 'rotated'
  layer: number
}

export interface ContainerPlan {
  containerType: ContainerType
  container: Dimension3D
  packingSpace: PackingSpace
  fits: boolean
  summary: {
    totalUnits: number
    bareCbm: number
    packedCbm: number
    containerCbm: number
    utilizationRatio: number
    unpackedItems: number
  }
  placements: Placement[]
  unpackedItems: Array<{ itemId: string; label: string; index: number }>
}

export interface ExpandedUnitPreview {
  unitKey: string
  itemId: string
  label: string
  index: number
  fragile: boolean
  supplierFlag: SupplierFlag
  singleWeightKg: number
  productCode: string
  boxNo: string
  boxCount: number
  declaredQuantity: number
  piNo: string
  packagingVisualType: PackagingVisualType
  bare: Dimension3D
  packed: Dimension3D
}

export interface ContainerPlanCandidate {
  candidateId: string
  strategyLabel: string
  plan: ContainerPlan
}

export interface MultiContainerBatch {
  batchId: string
  containerIndex: number
  strategyLabel: string
  candidateId: string
  units: ExpandedUnitPreview[]
  plan: ContainerPlan
}

export interface MultiContainerPlan {
  containerType: ContainerType
  container: Dimension3D
  packingSpace: PackingSpace
  batches: MultiContainerBatch[]
  unpackedItems: Array<{ itemId: string; label: string; index: number }>
  summary: {
    totalUnits: number
    packedUnits: number
    totalContainers: number
    bareCbm: number
    packedCbm: number
    containerCbm: number
    utilizationRatio: number
    unpackedItems: number
  }
}

export interface ContainerRecommendation {
  containerType: ContainerType
  plan: MultiContainerPlan
  score: number
}

export interface PackingSequenceStep {
  sequenceId: string
  itemId: string
  label: string
  index: number
  supplierFlag: SupplierFlag
  fragile: boolean
  productCode: string
  boxNo: string
  boxCount: number
  declaredQuantity: number
  piNo: string
  packagingVisualType: PackagingVisualType
  packed: Dimension3D
  note: string
}

export type PlacementAxis = 'xCm' | 'yCm' | 'zCm'

const CONTAINERS: Record<ContainerType, Dimension3D> = {
  '4.2M_TRUCK': { lengthCm: 420, widthCm: 210, heightCm: 210 },
  '6.8M_TRUCK': { lengthCm: 680, widthCm: 235, heightCm: 240 },
  '9.6M_TRUCK': { lengthCm: 960, widthCm: 240, heightCm: 250 },
  '20GP': { lengthCm: 589, widthCm: 235, heightCm: 239 },
  '40GP': { lengthCm: 1203, widthCm: 235, heightCm: 239 },
  '40HQ': { lengthCm: 1203, widthCm: 235, heightCm: 269 },
  CUSTOM: { lengthCm: 1200, widthCm: 235, heightCm: 239 },
  AIR_PALLET: { lengthCm: 120, widthCm: 80, heightCm: 160 },
  AIR_BULK: { lengthCm: 240, widthCm: 240, heightCm: 160 },
}

const RECOMMENDABLE_CONTAINERS: ContainerType[] = [
  '20GP',
  '40GP',
  '40HQ',
  '4.2M_TRUCK',
  '6.8M_TRUCK',
  '9.6M_TRUCK',
]

const PACKAGING_RULES: Record<PackagingType, Dimension3D> = {
  none: { lengthCm: 0, widthCm: 0, heightCm: 0 },
  wood_frame: { lengthCm: 8, widthCm: 8, heightCm: 12 },
  wood_crate: { lengthCm: 12, widthCm: 12, heightCm: 17 },
}

function getPackedFootprint(unit: Pick<ExpandedUnit, 'packed'>) {
  return unit.packed.lengthCm * unit.packed.widthCm
}

function getPackedVolume(unit: Pick<ExpandedUnit, 'packed'>) {
  return calculateItemCbm(unit.packed)
}

function compareBusinessPriority(
  a: ExpandedUnit,
  b: ExpandedUnit,
  loadPriority: LoadPriority = 'self_first',
) {
  const supplierDiff = supplierPriority(a, loadPriority) - supplierPriority(b, loadPriority)
  if (supplierDiff !== 0) return supplierDiff

  const fragileDiff = Number(a.fragile) - Number(b.fragile)
  if (fragileDiff !== 0) return fragileDiff

  const weightDiff = b.singleWeightKg - a.singleWeightKg
  if (weightDiff !== 0) return weightDiff

  const heightDiff = b.packed.heightCm - a.packed.heightCm
  if (heightDiff !== 0) return heightDiff

  const footprintDiff = getPackedFootprint(b) - getPackedFootprint(a)
  if (footprintDiff !== 0) return footprintDiff

  return getPackedVolume(b) - getPackedVolume(a)
}

function getPackingStrategies(loadPriority: LoadPriority): Array<{
  id: string
  label: string
  sorter: (a: ExpandedUnit, b: ExpandedUnit) => number
}> {
  return [
  {
    id: 'inside-heavy-tall',
    label:
      loadPriority === 'other_first'
        ? '里到外 · 第三方优先 · 重件高件优先'
        : loadPriority === 'balanced'
          ? '里到外 · 平衡混装 · 重件高件优先'
          : '里到外 · 己方优先 · 重件高件优先',
    sorter: (a, b) =>
      compareBusinessPriority(a, b, loadPriority) ||
      b.packed.lengthCm - a.packed.lengthCm ||
      b.packed.widthCm - a.packed.widthCm,
  },
  {
    id: 'inside-footprint-heavy',
    label:
      loadPriority === 'other_first'
        ? '里到外 · 第三方优先 · 底盘重件优先'
        : loadPriority === 'balanced'
          ? '里到外 · 平衡混装 · 底盘重件优先'
          : '里到外 · 己方优先 · 底盘重件优先',
    sorter: (a, b) =>
      supplierPriority(a, loadPriority) - supplierPriority(b, loadPriority) ||
      Number(a.fragile) - Number(b.fragile) ||
      getPackedFootprint(b) - getPackedFootprint(a) ||
      b.singleWeightKg - a.singleWeightKg ||
      b.packed.heightCm - a.packed.heightCm ||
      getPackedVolume(b) - getPackedVolume(a),
  },
  {
    id: 'inside-tall-stack',
    label:
      loadPriority === 'other_first'
        ? '里到外 · 第三方优先 · 高件堆叠优先'
        : loadPriority === 'balanced'
          ? '里到外 · 平衡混装 · 高件堆叠优先'
          : '里到外 · 己方优先 · 高件堆叠优先',
    sorter: (a, b) =>
      supplierPriority(a, loadPriority) - supplierPriority(b, loadPriority) ||
      Number(a.fragile) - Number(b.fragile) ||
      b.packed.heightCm - a.packed.heightCm ||
      b.singleWeightKg - a.singleWeightKg ||
      getPackedFootprint(b) - getPackedFootprint(a) ||
      getPackedVolume(b) - getPackedVolume(a),
  },
  {
    id: 'volume-desc',
    label: '体积优先',
    sorter: (a, b) => {
      const volumeDiff = getPackedVolume(b) - getPackedVolume(a)
      if (volumeDiff !== 0) return volumeDiff
      const supplierDiff = supplierPriority(a, loadPriority) - supplierPriority(b, loadPriority)
      if (supplierDiff !== 0) return supplierDiff
      const weightDiff = b.singleWeightKg - a.singleWeightKg
      if (weightDiff !== 0) return weightDiff
      return getPackedFootprint(b) - getPackedFootprint(a)
    },
  },
  {
    id: 'height-desc',
    label: '高度优先',
    sorter: (a, b) =>
      b.packed.heightCm - a.packed.heightCm ||
      supplierPriority(a, loadPriority) - supplierPriority(b, loadPriority) ||
      b.singleWeightKg - a.singleWeightKg ||
      getPackedVolume(b) - getPackedVolume(a),
  },
  {
    id: 'footprint-desc',
    label: '底面积优先',
    sorter: (a, b) =>
      getPackedFootprint(b) - getPackedFootprint(a) ||
      supplierPriority(a, loadPriority) - supplierPriority(b, loadPriority) ||
      b.singleWeightKg - a.singleWeightKg ||
      getPackedVolume(b) - getPackedVolume(a),
  },
  {
    id: 'width-desc',
    label: '宽度优先',
    sorter: (a, b) =>
      b.packed.widthCm - a.packed.widthCm ||
      supplierPriority(a, loadPriority) - supplierPriority(b, loadPriority) ||
      b.singleWeightKg - a.singleWeightKg ||
      getPackedVolume(b) - getPackedVolume(a),
  },
  {
    id: 'length-desc',
    label: '长度优先',
    sorter: (a, b) =>
      b.packed.lengthCm - a.packed.lengthCm ||
      supplierPriority(a, loadPriority) - supplierPriority(b, loadPriority) ||
      b.singleWeightKg - a.singleWeightKg ||
      getPackedVolume(b) - getPackedVolume(a),
  },
  {
    id: 'height-asc',
    label: '低矮件优先',
    sorter: (a, b) =>
      a.packed.heightCm - b.packed.heightCm ||
      supplierPriority(a, loadPriority) - supplierPriority(b, loadPriority) ||
      b.singleWeightKg - a.singleWeightKg ||
      getPackedVolume(b) - getPackedVolume(a),
  },
]
}

export function getContainerDimensions(
  containerType: ContainerType,
  customContainer?: Dimension3D,
) {
  if (containerType === 'CUSTOM' && customContainer) {
    return customContainer
  }

  return CONTAINERS[containerType]
}

export function getContainerLabel(containerType: ContainerType) {
  return containerType === 'CUSTOM' ? '自定义柜型' : containerType
}

export function resolvePackingSpace({
  container,
  remainingSpace,
}: {
  container: Dimension3D
  remainingSpace?: RemainingSpaceInput
}): PackingSpace {
  if (!remainingSpace?.enabled) {
    return {
      ...container,
      originXCm: 0,
      label: '完整货柜',
    }
  }

  const lengthCm = Math.max(1, Math.min(container.lengthCm, remainingSpace.lengthCm))
  const widthCm = Math.max(1, Math.min(container.widthCm, remainingSpace.widthCm))
  const heightCm = Math.max(1, Math.min(container.heightCm, remainingSpace.heightCm))

  return {
    lengthCm,
    widthCm,
    heightCm,
    originXCm: Math.max(container.lengthCm - lengthCm, 0),
    label: '入口剩余空间',
  }
}

export function calculateItemCbm({
  lengthCm,
  widthCm,
  heightCm,
  quantity = 1,
}: CbmInput) {
  return (lengthCm * widthCm * heightCm * quantity) / 1_000_000
}

export function applyPackagingRule({
  lengthCm,
  widthCm,
  heightCm,
  packagingType,
}: Dimension3D & { packagingType: PackagingType }): Dimension3D {
  const expansion = PACKAGING_RULES[packagingType]
  return {
    lengthCm: lengthCm + expansion.lengthCm,
    widthCm: widthCm + expansion.widthCm,
    heightCm: heightCm + expansion.heightCm,
  }
}

export function resolveItemDimensions(item: ItemInput): {
  input: Dimension3D
  packed: Dimension3D
} {
  const input = {
    lengthCm: item.lengthCm,
    widthCm: item.widthCm,
    heightCm: item.heightCm,
  }

  const woodThicknessCm =
    item.packagingType === 'wood_crate'
      ? (item.woodThicknessCm ?? 3)
      : item.packagingType === 'wood_frame'
        ? (item.woodThicknessCm ?? 2)
        : 0
  const woodExpansion = item.packagingType === 'none' ? 0 : woodThicknessCm * 2
  const supportFeet = item.packagingType === 'none' ? 0 : 5

  if (item.dimensionInputMode === 'outer_box') {
    return {
      input,
      packed: {
        lengthCm: input.lengthCm + woodExpansion,
        widthCm: input.widthCm + woodExpansion,
        heightCm: input.heightCm + woodExpansion + supportFeet,
      },
    }
  }

  const cartonExpansion = item.cartonEnabled ? item.cartonThicknessCm * 2 : 0
  const foamExpansion = item.foamEnabled ? item.foamThicknessCm * 2 : 0
  const packagingExpansion = woodExpansion + cartonExpansion + foamExpansion

  return {
    input,
    packed: {
      lengthCm: input.lengthCm + packagingExpansion,
      widthCm: input.widthCm + packagingExpansion,
      heightCm: input.heightCm + packagingExpansion + supportFeet,
    },
  }
}

export function getPackagingVisualType(
  item: Pick<ItemInput, 'packagingType' | 'cartonEnabled' | 'foamEnabled' | 'dimensionInputMode'>,
): PackagingVisualType {
  if (item.packagingType === 'wood_crate') return 'wood_crate'
  if (item.packagingType === 'wood_frame') return 'wood_frame'
  if (item.dimensionInputMode === 'outer_box') return 'paper'
  if (item.cartonEnabled) return 'paper'
  if (item.foamEnabled) return 'foam'
  return 'none'
}

type ExpandedUnit = {
  itemId: string
  label: string
  index: number
  fragile: boolean
  supplierFlag: SupplierFlag
  singleWeightKg: number
  productCode: string
  boxNo: string
  boxCount: number
  declaredQuantity: number
  piNo: string
  packagingVisualType: PackagingVisualType
  bare: Dimension3D
  packed: Dimension3D
}

type PackingCandidate = {
  placements: Placement[]
  unpackedItems: Array<{ itemId: string; label: string; index: number }>
  placedPackedCbm: number
}

type CandidatePlacement = {
  itemId: string
  label: string
  index: number
  fragile: boolean
  supplierFlag: SupplierFlag
  singleWeightKg: number
  productCode: string
  boxNo: string
  boxCount: number
  declaredQuantity: number
  piNo: string
  packagingVisualType: PackagingVisualType
  lengthCm: number
  widthCm: number
  heightCm: number
  xCm: number
  yCm: number
  zCm: number
  rotation: 'default' | 'rotated'
}

type Anchor = {
  xCm: number
  yCm: number
  zCm: number
}

export function calculateContainerPlan({
  containerType,
  items,
  customContainer,
  remainingSpace,
  loadPriority = 'self_first',
}: {
  containerType: ContainerType
  items: ItemInput[]
  customContainer?: Dimension3D
  remainingSpace?: RemainingSpaceInput
  loadPriority?: LoadPriority
}): ContainerPlan {
  return generateContainerPlanCandidates({
    containerType,
    items,
    customContainer,
    remainingSpace,
    loadPriority,
  })[0].plan
}

export function calculateContainerPlanWithSequence({
  containerType,
  items,
  orderedUnitKeys,
  customContainer,
  remainingSpace,
  loadPriority = 'self_first',
}: {
  containerType: ContainerType
  items: ItemInput[]
  orderedUnitKeys: string[]
  customContainer?: Dimension3D
  remainingSpace?: RemainingSpaceInput
  loadPriority?: LoadPriority
}): ContainerPlan {
  const container = getContainerDimensions(containerType, customContainer)
  const packingSpace = resolvePackingSpace({ container, remainingSpace })
  const units = expandUnits(items)
  const bareCbm = units.reduce((sum, unit) => sum + calculateItemCbm(unit.bare), 0)
  const packedCbm = units.reduce(
    (sum, unit) => sum + calculateItemCbm(unit.packed),
    0,
  )
  const containerCbm = calculateItemCbm(packingSpace)

  const unitsByKey = new Map<string, ExpandedUnit>(
    units.map((unit) => [`${unit.itemId}-${unit.index}`, unit] as const),
  )
  const orderedUnits: ExpandedUnit[] = []
  const usedKeys = new Set<string>()

  for (const key of orderedUnitKeys) {
    const unit = unitsByKey.get(key)
    if (!unit || usedKeys.has(key)) {
      continue
    }
    orderedUnits.push(unit)
    usedKeys.add(key)
  }

  for (const unit of units) {
    const key = `${unit.itemId}-${unit.index}`
    if (usedKeys.has(key)) {
      continue
    }
    orderedUnits.push(unit)
  }

  const candidate = buildPlanForOrderedUnits(packingSpace, orderedUnits, loadPriority)

  return {
    containerType,
    container,
    packingSpace,
    fits: candidate.unpackedItems.length === 0,
    summary: {
      totalUnits: units.length,
      bareCbm,
      packedCbm,
      containerCbm,
      utilizationRatio: candidate.placedPackedCbm / containerCbm,
      unpackedItems: candidate.unpackedItems.length,
    },
    placements: candidate.placements,
    unpackedItems: candidate.unpackedItems,
  }
}

export function getExpandedUnitPreview(items: ItemInput[]): ExpandedUnitPreview[] {
  return expandUnits(items).map((unit) => ({
    unitKey: `${unit.itemId}-${unit.index}`,
    itemId: unit.itemId,
    label: unit.label,
    index: unit.index,
    fragile: unit.fragile,
    supplierFlag: unit.supplierFlag,
    singleWeightKg: unit.singleWeightKg,
    productCode: unit.productCode,
    boxNo: unit.boxNo,
    boxCount: unit.boxCount,
    declaredQuantity: unit.declaredQuantity,
    piNo: unit.piNo,
    packagingVisualType: unit.packagingVisualType,
    bare: unit.bare,
    packed: unit.packed,
  }))
}

export function generatePackingSequence(
  items: ItemInput[],
  loadPriority: LoadPriority = 'self_first',
): PackingSequenceStep[] {
  return expandUnits(items)
    .sort((a, b) => {
      const packagingDiff = getPackagingPriority(b.packagingVisualType) - getPackagingPriority(a.packagingVisualType)
      if (packagingDiff !== 0) return packagingDiff
      const businessDiff = compareBusinessPriority(a, b, loadPriority)
      if (businessDiff !== 0) return businessDiff
      return a.index - b.index
    })
    .map((unit) => ({
      sequenceId: `${unit.itemId}-${unit.index}`,
      itemId: unit.itemId,
      label: unit.label,
      index: unit.index,
      supplierFlag: unit.supplierFlag,
      fragile: unit.fragile,
      productCode: unit.productCode,
      boxNo: unit.boxNo,
      boxCount: unit.boxCount,
      declaredQuantity: unit.declaredQuantity,
      piNo: unit.piNo,
      packagingVisualType: unit.packagingVisualType,
      packed: unit.packed,
      note: buildPackingNote(unit),
    }))
}

export function recommendContainerPlans({
  items,
  splitMode = 'mixed',
  remainingSpace,
  loadPriority = 'self_first',
}: {
  items: ItemInput[]
  splitMode?: SplitMode
  remainingSpace?: RemainingSpaceInput
  loadPriority?: LoadPriority
}): ContainerRecommendation[] {
  return RECOMMENDABLE_CONTAINERS.map((containerType) => {
    const plan = calculateMultiContainerPlan({
      containerType,
      items,
      splitMode,
      remainingSpace,
      loadPriority,
    })

    return {
      containerType,
      plan,
      score:
        (plan.summary.unpackedItems === 0 ? 1_000_000_000 : 0) -
        plan.summary.unpackedItems * 1_000_000 -
        plan.summary.totalContainers * 100_000 -
        plan.summary.containerCbm * plan.summary.totalContainers +
        Math.round(plan.summary.utilizationRatio * 10_000),
    }
  }).sort((a, b) => b.score - a.score)
}

export function generateContainerPlanCandidatesForUnits({
  containerType,
  units,
  customContainer,
  remainingSpace,
  loadPriority = 'self_first',
}: {
  containerType: ContainerType
  units: ExpandedUnitPreview[]
  customContainer?: Dimension3D
  remainingSpace?: RemainingSpaceInput
  loadPriority?: LoadPriority
}): ContainerPlanCandidate[] {
  const expandedUnits = units.map((unit) => ({
    itemId: unit.itemId,
    label: unit.label,
    index: unit.index,
    fragile: unit.fragile,
    supplierFlag: unit.supplierFlag,
    singleWeightKg: unit.singleWeightKg,
    productCode: unit.productCode,
    boxNo: unit.boxNo,
    boxCount: unit.boxCount,
    declaredQuantity: unit.declaredQuantity,
    piNo: unit.piNo,
    packagingVisualType: unit.packagingVisualType,
    bare: unit.bare,
    packed: unit.packed,
  }))

  return generateCandidatePlansFromExpandedUnits({
    containerType,
    expandedUnits,
    customContainer,
    remainingSpace,
    loadPriority,
  })
}

export function calculateContainerPlanWithSequenceForUnits({
  containerType,
  units,
  orderedUnitKeys,
  customContainer,
  remainingSpace,
  loadPriority = 'self_first',
}: {
  containerType: ContainerType
  units: ExpandedUnitPreview[]
  orderedUnitKeys: string[]
  customContainer?: Dimension3D
  remainingSpace?: RemainingSpaceInput
  loadPriority?: LoadPriority
}): ContainerPlan {
  const unitsByKey = new Map(
    units.map((unit) => [
      unit.unitKey,
      {
        itemId: unit.itemId,
        label: unit.label,
        index: unit.index,
        fragile: unit.fragile,
        supplierFlag: unit.supplierFlag,
        singleWeightKg: unit.singleWeightKg,
        productCode: unit.productCode,
        boxNo: unit.boxNo,
        boxCount: unit.boxCount,
        declaredQuantity: unit.declaredQuantity,
        piNo: unit.piNo,
        packagingVisualType: unit.packagingVisualType,
        bare: unit.bare,
        packed: unit.packed,
      },
    ] as const),
  )

  const orderedUnits: ExpandedUnit[] = []
  const usedKeys = new Set<string>()

  for (const key of orderedUnitKeys) {
    const unit = unitsByKey.get(key)
    if (!unit || usedKeys.has(key)) {
      continue
    }
    orderedUnits.push(unit)
    usedKeys.add(key)
  }

  for (const unit of units) {
    if (usedKeys.has(unit.unitKey)) {
      continue
    }
    const expanded = unitsByKey.get(unit.unitKey)
    if (expanded) {
      orderedUnits.push(expanded)
    }
  }

  return buildContainerPlanFromOrderedUnits({
    containerType,
    orderedUnits,
    customContainer,
    remainingSpace,
    loadPriority,
  })
}

export function nudgePlacementInPlan({
  plan,
  placementId,
  axis,
  deltaCm,
}: {
  plan: ContainerPlan
  placementId: string
  axis: PlacementAxis
  deltaCm: number
}): ContainerPlan | null {
  const nextPlacements = plan.placements.map((placement) => ({ ...placement }))
  const targetIndex = nextPlacements.findIndex(
    (placement) => `${placement.itemId}-${placement.index}` === placementId,
  )

  if (targetIndex === -1) {
    return null
  }

  nextPlacements[targetIndex][axis] += deltaCm
  if (nextPlacements[targetIndex][axis] < 0) {
    return null
  }

  if (!isValidPlacementArrangement(nextPlacements, plan.packingSpace)) {
    return null
  }

  const layers = [...new Set(nextPlacements.map((placement) => placement.zCm))].sort((a, b) => a - b)
  const normalizedPlacements = nextPlacements.map((placement) => ({
    ...placement,
    layer: layers.indexOf(placement.zCm),
  }))

  return {
    ...plan,
    placements: normalizedPlacements,
  }
}

export function calculateMultiContainerPlan({
  containerType,
  items,
  customContainer,
  splitMode = 'mixed',
  remainingSpace,
  loadPriority = 'self_first',
}: {
  containerType: ContainerType
  items: ItemInput[]
  customContainer?: Dimension3D
  splitMode?: SplitMode
  remainingSpace?: RemainingSpaceInput
  loadPriority?: LoadPriority
}): MultiContainerPlan {
  const container = getContainerDimensions(containerType, customContainer)
  const packingSpace = resolvePackingSpace({ container, remainingSpace })
  const allUnits = getExpandedUnitPreview(items)
  const batches: MultiContainerBatch[] = []
  let remaining = [...allUnits]
  const pools = splitMode === 'separate_suppliers'
    ? getSupplierPools(remaining, loadPriority)
    : [remaining]

  for (const pool of pools) {
    let poolRemaining = [...pool]

    while (poolRemaining.length > 0) {
      const candidates = generateContainerPlanCandidatesForUnits({
        containerType,
        units: poolRemaining,
        customContainer,
        remainingSpace,
        loadPriority,
      })
      const best = candidates[0]

      if (!best || best.plan.placements.length === 0) {
        break
      }

      batches.push({
        batchId: `batch-${batches.length + 1}`,
        containerIndex: batches.length + 1,
        strategyLabel: best.strategyLabel,
        candidateId: best.candidateId,
        units: poolRemaining.filter((unit) =>
          best.plan.placements.some(
            (placement) => `${placement.itemId}-${placement.index}` === unit.unitKey,
          ),
        ),
        plan: best.plan,
      })

      const packedKeys = new Set(
        best.plan.placements.map((placement) => `${placement.itemId}-${placement.index}`),
      )
      poolRemaining = poolRemaining.filter((unit) => !packedKeys.has(unit.unitKey))
      remaining = remaining.filter((unit) => !packedKeys.has(unit.unitKey))
    }
  }

  const packedUnits = batches.reduce((sum, batch) => sum + batch.plan.placements.length, 0)
  const bareCbm = allUnits.reduce((sum, unit) => sum + calculateItemCbm(unit.bare), 0)
  const packedCbm = allUnits.reduce((sum, unit) => sum + calculateItemCbm(unit.packed), 0)
  const containerCbm = calculateItemCbm(packingSpace)
  const totalPlacedPackedCbm = batches.reduce(
    (sum, batch) => sum + batch.plan.summary.utilizationRatio * batch.plan.summary.containerCbm,
    0,
  )

  return {
    containerType,
    container,
    packingSpace,
    batches,
    unpackedItems: remaining.map((unit) => ({
      itemId: unit.itemId,
      label: unit.label,
      index: unit.index,
    })),
    summary: {
      totalUnits: allUnits.length,
      packedUnits,
      totalContainers: batches.length,
      bareCbm,
      packedCbm,
      containerCbm,
      utilizationRatio: batches.length > 0 ? totalPlacedPackedCbm / (containerCbm * batches.length) : 0,
      unpackedItems: remaining.length,
    },
  }
}

export function generateContainerPlanCandidates({
  containerType,
  items,
  customContainer,
  remainingSpace,
  loadPriority = 'self_first',
}: {
  containerType: ContainerType
  items: ItemInput[]
  customContainer?: Dimension3D
  remainingSpace?: RemainingSpaceInput
  loadPriority?: LoadPriority
}): ContainerPlanCandidate[] {
  return generateCandidatePlansFromExpandedUnits({
    containerType,
    expandedUnits: expandUnits(items),
    customContainer,
    remainingSpace,
    loadPriority,
  })
}

function expandUnits(items: ItemInput[]): ExpandedUnit[] {
  const units: ExpandedUnit[] = []

  for (const item of items) {
    for (let index = 0; index < item.quantity; index += 1) {
      const resolved = resolveItemDimensions(item)
      units.push({
        itemId: item.id,
        label: item.label,
        index,
        fragile: item.fragile,
        supplierFlag: item.supplierFlag ?? 'self',
        singleWeightKg: item.singleWeightKg ?? 1,
        productCode: item.productCode ?? '',
        boxNo: item.boxNo ?? `${item.id}-${index + 1}`,
        boxCount: item.boxCount ?? 1,
        declaredQuantity: item.quantity,
        piNo: item.piNo ?? '',
        packagingVisualType: getPackagingVisualType(item),
        bare: resolved.input,
        packed: resolved.packed,
      })
    }
  }

  return units
}

function getPackagingPriority(type: PackagingVisualType) {
  switch (type) {
    case 'wood_crate':
      return 4
    case 'wood_frame':
      return 3
    case 'paper':
      return 2
    case 'foam':
      return 1
    default:
      return 0
  }
}

function buildPackingNote(unit: ExpandedUnit) {
  const parts: string[] = []

  if (unit.packagingVisualType === 'wood_crate') parts.push('先打木箱')
  else if (unit.packagingVisualType === 'wood_frame') parts.push('先打木架')
  else if (unit.packagingVisualType === 'paper') parts.push('按纸皮箱外箱准备')
  else if (unit.packagingVisualType === 'foam') parts.push('先包泡沫')
  else parts.push('直接按外箱准备')

  if (unit.fragile) {
    parts.push('易碎件，建议后移装柜')
  }

  if (unit.supplierFlag === 'other') {
    parts.push('第三方货，适合拼柜单独归类')
  }

  return parts.join(' · ')
}

function generateCandidatePlansFromExpandedUnits({
  containerType,
  expandedUnits,
  customContainer,
  remainingSpace,
  loadPriority = 'self_first',
}: {
  containerType: ContainerType
  expandedUnits: ExpandedUnit[]
  customContainer?: Dimension3D
  remainingSpace?: RemainingSpaceInput
  loadPriority?: LoadPriority
}): ContainerPlanCandidate[] {
  const container = getContainerDimensions(containerType, customContainer)
  const packingSpace = resolvePackingSpace({ container, remainingSpace })
  const bareCbm = expandedUnits.reduce((sum, unit) => sum + calculateItemCbm(unit.bare), 0)
  const packedCbm = expandedUnits.reduce((sum, unit) => sum + calculateItemCbm(unit.packed), 0)
  const containerCbm = calculateItemCbm(packingSpace)

  const seen = new Set<string>()
  const candidates = getPackingStrategies(loadPriority).flatMap(({ id, label, sorter }) =>
    buildStrategyVariants([...expandedUnits].sort(sorter), id, label).map(
      ({ candidateId, strategyLabel, orderedUnits }) => {
        const candidate = buildPlanForOrderedUnits(packingSpace, orderedUnits, loadPriority)
        return {
          candidateId,
          strategyLabel,
          plan: {
            containerType,
            container,
            packingSpace,
            fits: candidate.unpackedItems.length === 0,
            summary: {
              totalUnits: expandedUnits.length,
              bareCbm,
              packedCbm,
              containerCbm,
              utilizationRatio: candidate.placedPackedCbm / containerCbm,
              unpackedItems: candidate.unpackedItems.length,
            },
            placements: candidate.placements,
            unpackedItems: candidate.unpackedItems,
          },
          score: scoreCandidate(candidate, containerCbm, loadPriority),
        }
      },
    ),
  )
    .sort((a, b) => b.score - a.score)
    .filter((candidate) => {
      const signature = candidate.plan.placements
        .map(
          (placement) =>
            `${placement.itemId}-${placement.index}@${placement.xCm}:${placement.yCm}:${placement.zCm}`,
        )
        .join('|')
      if (seen.has(signature)) {
        return false
      }
      seen.add(signature)
      return true
    })

  return candidates.map(({ score: _score, ...candidate }) => candidate)
}

function buildStrategyVariants(
  sortedUnits: ExpandedUnit[],
  baseId: string,
  baseLabel: string,
) {
  const variants: Array<{
    candidateId: string
    strategyLabel: string
    orderedUnits: ExpandedUnit[]
  }> = [
    {
      candidateId: baseId,
      strategyLabel: baseLabel,
      orderedUnits: sortedUnits,
    },
  ]

  for (let index = 1; index < Math.min(sortedUnits.length, 4); index += 1) {
    variants.push({
      candidateId: `${baseId}-promote-${index}`,
      strategyLabel: `${baseLabel} · 前置扰动 ${index}`,
      orderedUnits: [
        sortedUnits[index],
        ...sortedUnits.slice(0, index),
        ...sortedUnits.slice(index + 1),
      ],
    })
  }

  for (let index = 0; index < Math.min(sortedUnits.length - 1, 4); index += 1) {
    const swapped = [...sortedUnits]
    ;[swapped[index], swapped[index + 1]] = [swapped[index + 1], swapped[index]]
    variants.push({
      candidateId: `${baseId}-swap-${index}`,
      strategyLabel: `${baseLabel} · 邻位扰动 ${index + 1}`,
      orderedUnits: swapped,
    })
  }

  return variants
}

function buildContainerPlanFromOrderedUnits({
  containerType,
  orderedUnits,
  customContainer,
  remainingSpace,
  loadPriority = 'self_first',
}: {
  containerType: ContainerType
  orderedUnits: ExpandedUnit[]
  customContainer?: Dimension3D
  remainingSpace?: RemainingSpaceInput
  loadPriority?: LoadPriority
}): ContainerPlan {
  const container = getContainerDimensions(containerType, customContainer)
  const packingSpace = resolvePackingSpace({ container, remainingSpace })
  const bareCbm = orderedUnits.reduce((sum, unit) => sum + calculateItemCbm(unit.bare), 0)
  const packedCbm = orderedUnits.reduce((sum, unit) => sum + calculateItemCbm(unit.packed), 0)
  const containerCbm = calculateItemCbm(packingSpace)
  const candidate = buildPlanForOrderedUnits(packingSpace, orderedUnits, loadPriority)

  return {
    containerType,
    container,
    packingSpace,
    fits: candidate.unpackedItems.length === 0,
    summary: {
      totalUnits: orderedUnits.length,
      bareCbm,
      packedCbm,
      containerCbm,
      utilizationRatio: candidate.placedPackedCbm / containerCbm,
      unpackedItems: candidate.unpackedItems.length,
    },
    placements: candidate.placements,
    unpackedItems: candidate.unpackedItems,
  }
}

function buildPlanForOrderedUnits(
  container: Dimension3D,
  orderedUnits: ExpandedUnit[],
  loadPriority: LoadPriority = 'self_first',
): PackingCandidate {
  const placedUnits: CandidatePlacement[] = []
  const unpackedItems: Array<{ itemId: string; label: string; index: number }> = []
  let placedPackedCbm = 0
  let anchors: Anchor[] = [{ xCm: 0, yCm: 0, zCm: 0 }]

  for (const unit of orderedUnits) {
    const placed = findBestPlacement({
      anchors,
      container,
      placedUnits,
      unit,
      loadPriority,
    })

    if (!placed) {
      unpackedItems.push({
        itemId: unit.itemId,
        label: unit.label,
        index: unit.index,
      })
      continue
    }

    placedUnits.push(placed)

    placedPackedCbm += calculateItemCbm({
      lengthCm: placed.lengthCm,
      widthCm: placed.widthCm,
      heightCm: placed.heightCm,
    })

    anchors = expandAnchorsWithPlacement(anchors, placed)
      .filter(
      (anchor) =>
        anchor.xCm < container.lengthCm &&
        anchor.yCm < container.widthCm &&
        anchor.zCm < container.heightCm,
    )
  }

  const compactedPlacements = compactCandidatePlacements(container, placedUnits)
  const layers = [...new Set(compactedPlacements.map((placement) => placement.zCm))].sort((a, b) => a - b)
  const placements: Placement[] = compactedPlacements.map((placement) => ({
    ...placement,
    layer: layers.indexOf(placement.zCm),
  }))

  return {
    placements,
    unpackedItems,
    placedPackedCbm,
  }
}

function scoreCandidate(
  candidate: PackingCandidate,
  containerCbm: number,
  loadPriority: LoadPriority = 'self_first',
) {
  const fitsScore = candidate.unpackedItems.length === 0 ? 1_000_000 : 0
  const placedUnitsScore = candidate.placements.length * 10_000
  const utilizationScore = Math.round((candidate.placedPackedCbm / containerCbm) * 10_000)
  const usedLength = Math.max(
    ...candidate.placements.map((placement) => placement.xCm + placement.lengthCm),
    0,
  )
  const usedWidth = Math.max(
    ...candidate.placements.map((placement) => placement.yCm + placement.widthCm),
    0,
  )
  const usedHeight = Math.max(
    ...candidate.placements.map((placement) => placement.zCm + placement.heightCm),
    0,
  )
  const usedEnvelopeVolume = Math.max(usedLength * usedWidth * usedHeight, 1)
  const packedEnvelopeDensity = candidate.placedPackedCbm / (usedEnvelopeVolume / 1_000_000)
  const lowerStackPenalty = -candidate.placements.reduce(
    (sum, placement) => sum + placement.zCm * (placement.singleWeightKg || 1),
    0,
  )
  const boundingHeightPenalty = -usedHeight * 4
  const frontSpreadPenalty = -usedWidth * 12
  const supplierInteriorScore = candidate.placements.reduce((sum, placement) => {
    if (loadPriority === 'balanced') {
      return sum
    }
    return sum + (placement.supplierFlag === preferredSupplierFlag(loadPriority) ? -placement.xCm : placement.xCm)
  }, 0)
  const floorPlacements = candidate.placements.filter((placement) => placement.zCm === 0)
  const floorUsedArea = floorPlacements.reduce(
    (sum, placement) => sum + placement.lengthCm * placement.widthCm,
    0,
  )
  const floorSpanX =
    floorPlacements.length > 0
      ? Math.max(...floorPlacements.map((placement) => placement.xCm + placement.lengthCm)) -
        Math.min(...floorPlacements.map((placement) => placement.xCm))
      : 0
  const floorSpanY =
    floorPlacements.length > 0
      ? Math.max(...floorPlacements.map((placement) => placement.yCm + placement.widthCm)) -
        Math.min(...floorPlacements.map((placement) => placement.yCm))
      : 0
  const floorVoidPenalty =
    floorPlacements.length > 1 ? -(floorSpanX * floorSpanY - floorUsedArea) * 3 : 0
  const stackedPlacements = candidate.placements.filter((placement) => placement.zCm > 0)
  const stackedPlacementReward = stackedPlacements.length * 2_000
  const tailCompactionReward = -usedLength * 35
  const envelopeDensityScore = Math.round(packedEnvelopeDensity * 2_000)
  const heavyTopPenalty = -stackedPlacements.reduce((sum, placement) => {
    const supportingWeight = getAverageSupportWeight(placement, candidate.placements)
    const excessWeight = Math.max(0, placement.singleWeightKg - supportingWeight)
    return sum + excessWeight * 300 + placement.singleWeightKg * placement.zCm * 2
  }, 0)

  return (
    fitsScore +
    placedUnitsScore +
    utilizationScore +
    lowerStackPenalty +
    boundingHeightPenalty +
    frontSpreadPenalty +
    supplierInteriorScore +
    floorVoidPenalty +
    stackedPlacementReward +
    tailCompactionReward +
    envelopeDensityScore +
    heavyTopPenalty
  )
}

function findBestPlacement({
  unit,
  container,
  anchors,
  placedUnits,
  loadPriority = 'self_first',
}: {
  unit: ExpandedUnit
  container: Dimension3D
  anchors: Anchor[]
  placedUnits: CandidatePlacement[]
  loadPriority?: LoadPriority
}) {
  const orientations = [
    {
      lengthCm: unit.packed.lengthCm,
      widthCm: unit.packed.widthCm,
      heightCm: unit.packed.heightCm,
      rotation: 'default' as const,
    },
    {
      lengthCm: unit.packed.widthCm,
      widthCm: unit.packed.lengthCm,
      heightCm: unit.packed.heightCm,
      rotation: 'rotated' as const,
    },
  ]
  let bestPlacement: CandidatePlacement | null = null
  let bestScore = Number.POSITIVE_INFINITY

  for (const anchor of anchors) {
    for (const orientation of orientations) {
      const candidate: CandidatePlacement = {
        itemId: unit.itemId,
        label: unit.label,
        index: unit.index,
        fragile: unit.fragile,
        supplierFlag: unit.supplierFlag,
        singleWeightKg: unit.singleWeightKg,
        productCode: unit.productCode,
        boxNo: unit.boxNo,
        boxCount: unit.boxCount,
        declaredQuantity: unit.declaredQuantity,
        piNo: unit.piNo,
        packagingVisualType: unit.packagingVisualType,
        ...orientation,
        xCm: anchor.xCm,
        yCm: anchor.yCm,
        zCm: anchor.zCm,
      }

      if (!isWithinContainer(candidate, container)) {
        continue
      }

      if (hasCollision(candidate, placedUnits)) {
        continue
      }

      const support = getSupportRatio(candidate, placedUnits)
      if (support < getMinimumSupportRatio(candidate)) {
        continue
      }

      if (restsOnFragilePlacement(candidate, placedUnits)) {
        continue
      }

      const tailRemaining = container.lengthCm - (candidate.xCm + candidate.lengthCm)
      const supplierPenalty =
        loadPriority === 'balanced'
          ? 0
          : (candidate.supplierFlag === preferredSupplierFlag(loadPriority)
              ? candidate.xCm
              : container.lengthCm - (candidate.xCm + candidate.lengthCm)) * 3
      const stackedWeightPenalty =
        candidate.zCm > 0 ? candidate.singleWeightKg * (candidate.zCm + 1) * 4 : 0
      const stableStackReward = candidate.zCm > 0 && support >= 0.8 ? -1_200 : 0
      const score =
        candidate.xCm * 5_000 +
        candidate.yCm * 450 +
        candidate.zCm * 120 +
        (1 - support) * 25_000 +
        stackedWeightPenalty +
        supplierPenalty -
        tailRemaining * 3 +
        stableStackReward

      if (score < bestScore) {
        bestScore = score
        bestPlacement = candidate
      }
    }
  }

  return bestPlacement
}

function isWithinContainer(placement: CandidatePlacement, container: Dimension3D) {
  return (
    placement.xCm + placement.lengthCm <= container.lengthCm &&
    placement.yCm + placement.widthCm <= container.widthCm &&
    placement.zCm + placement.heightCm <= container.heightCm
  )
}

function hasCollision(candidate: CandidatePlacement, placedUnits: CandidatePlacement[]) {
  return placedUnits.some(
    (placement) =>
      rangesOverlap(
        candidate.xCm,
        candidate.xCm + candidate.lengthCm,
        placement.xCm,
        placement.xCm + placement.lengthCm,
      ) &&
      rangesOverlap(
        candidate.yCm,
        candidate.yCm + candidate.widthCm,
        placement.yCm,
        placement.yCm + placement.widthCm,
      ) &&
      rangesOverlap(
        candidate.zCm,
        candidate.zCm + candidate.heightCm,
        placement.zCm,
        placement.zCm + placement.heightCm,
      ),
  )
}

function getSupportRatio(candidate: CandidatePlacement, placedUnits: CandidatePlacement[]) {
  if (candidate.zCm === 0) {
    return 1
  }

  const footprintArea = candidate.lengthCm * candidate.widthCm
  let supportedArea = 0

  for (const placement of placedUnits) {
    if (placement.zCm + placement.heightCm !== candidate.zCm) {
      continue
    }

    const overlapLength =
      Math.min(candidate.xCm + candidate.lengthCm, placement.xCm + placement.lengthCm) -
      Math.max(candidate.xCm, placement.xCm)
    const overlapWidth =
      Math.min(candidate.yCm + candidate.widthCm, placement.yCm + placement.widthCm) -
      Math.max(candidate.yCm, placement.yCm)

    if (overlapLength > 0 && overlapWidth > 0) {
      supportedArea += overlapLength * overlapWidth
    }
  }

  return supportedArea / footprintArea
}

function getMinimumSupportRatio(candidate: CandidatePlacement) {
  if (candidate.zCm === 0) {
    return 1
  }

  if (candidate.fragile) {
    return 0.8
  }

  if (candidate.singleWeightKg >= 80) {
    return 0.88
  }

  if (candidate.singleWeightKg >= 40) {
    return 0.8
  }

  return 0.72
}

function getAverageSupportWeight(
  candidate: CandidatePlacement,
  placedUnits: CandidatePlacement[],
) {
  if (candidate.zCm === 0) {
    return candidate.singleWeightKg
  }

  const overlaps: Array<{ area: number; weight: number }> = []

  for (const placement of placedUnits) {
    if (placement.itemId === candidate.itemId && placement.index === candidate.index) {
      continue
    }

    if (placement.zCm + placement.heightCm !== candidate.zCm) {
      continue
    }

    const overlapLength =
      Math.min(candidate.xCm + candidate.lengthCm, placement.xCm + placement.lengthCm) -
      Math.max(candidate.xCm, placement.xCm)
    const overlapWidth =
      Math.min(candidate.yCm + candidate.widthCm, placement.yCm + placement.widthCm) -
      Math.max(candidate.yCm, placement.yCm)

    if (overlapLength <= 0 || overlapWidth <= 0) {
      continue
    }

    overlaps.push({
      area: overlapLength * overlapWidth,
      weight: placement.singleWeightKg,
    })
  }

  if (overlaps.length === 0) {
    return 0
  }

  const totalArea = overlaps.reduce((sum, overlap) => sum + overlap.area, 0)
  const weightedWeight = overlaps.reduce(
    (sum, overlap) => sum + overlap.weight * overlap.area,
    0,
  )

  return weightedWeight / totalArea
}

function isValidPlacementArrangement(
  placements: CandidatePlacement[],
  container: Dimension3D,
) {
  for (let index = 0; index < placements.length; index += 1) {
    const candidate = placements[index]
    const others = placements.filter((_, otherIndex) => otherIndex !== index)

    if (!isWithinContainer(candidate, container)) {
      return false
    }

    if (hasCollision(candidate, others)) {
      return false
    }

    const support = getSupportRatio(candidate, others)
    if (support < getMinimumSupportRatio(candidate)) {
      return false
    }

    if (restsOnFragilePlacement(candidate, others)) {
      return false
    }
  }

  return true
}

function restsOnFragilePlacement(
  candidate: CandidatePlacement,
  placedUnits: CandidatePlacement[],
) {
  if (candidate.zCm === 0) {
    return false
  }

  return placedUnits.some((placement) => {
    if (!placement.fragile) {
      return false
    }
    if (placement.zCm + placement.heightCm !== candidate.zCm) {
      return false
    }

    return (
      rangesOverlap(
        candidate.xCm,
        candidate.xCm + candidate.lengthCm,
        placement.xCm,
        placement.xCm + placement.lengthCm,
      ) &&
      rangesOverlap(
        candidate.yCm,
        candidate.yCm + candidate.widthCm,
        placement.yCm,
        placement.yCm + placement.widthCm,
      )
    )
  })
}

function rangesOverlap(startA: number, endA: number, startB: number, endB: number) {
  return Math.max(startA, startB) < Math.min(endA, endB)
}

function dedupeAnchors(anchors: Anchor[]) {
  const seen = new Set<string>()

  return anchors.filter((anchor) => {
    const key = `${anchor.xCm}:${anchor.yCm}:${anchor.zCm}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  }).sort((left, right) => left.zCm - right.zCm || left.yCm - right.yCm || left.xCm - right.xCm)
}

function compactCandidatePlacements(
  container: Dimension3D,
  placements: CandidatePlacement[],
) {
  const nextPlacements = placements.map((placement) => ({ ...placement }))
  let changed = true
  let passes = 0

  while (changed && passes < 6) {
    changed = false
    passes += 1

    const orderedIndexes = nextPlacements
      .map((placement, index) => ({
        index,
        placement,
      }))
      .sort(
        (left, right) =>
          left.placement.zCm - right.placement.zCm ||
          left.placement.yCm - right.placement.yCm ||
          left.placement.xCm - right.placement.xCm,
      )
      .map((entry) => entry.index)

    for (const index of orderedIndexes) {
      const nextZ = findTighterAxisValue(nextPlacements, container, index, 'zCm')
      if (nextZ !== nextPlacements[index].zCm) {
        nextPlacements[index].zCm = nextZ
        changed = true
      }

      const nextY = findTighterAxisValue(nextPlacements, container, index, 'yCm')
      if (nextY !== nextPlacements[index].yCm) {
        nextPlacements[index].yCm = nextY
        changed = true
      }

      const nextX = findTighterAxisValue(nextPlacements, container, index, 'xCm')
      if (nextX !== nextPlacements[index].xCm) {
        nextPlacements[index].xCm = nextX
        changed = true
      }
    }
  }

  return nextPlacements
}

function findTighterAxisValue(
  placements: CandidatePlacement[],
  container: Dimension3D,
  index: number,
  axis: PlacementAxis,
) {
  const currentPlacement = placements[index]
  const currentValue = currentPlacement[axis]
  const otherPlacements = placements.filter((_, otherIndex) => otherIndex !== index)
  const candidates = new Set<number>([0])

  for (const placement of otherPlacements) {
    if (axis === 'xCm') {
      candidates.add(placement.xCm + placement.lengthCm)
    } else if (axis === 'yCm') {
      candidates.add(placement.yCm + placement.widthCm)
    } else {
      candidates.add(placement.zCm + placement.heightCm)
    }
  }

  for (const targetValue of [...candidates].sort((left, right) => left - right)) {
    if (targetValue >= currentValue) {
      continue
    }

    const nextPlacements = placements.map((placement) => ({ ...placement }))
    nextPlacements[index][axis] = targetValue

    if (isValidPlacementArrangement(nextPlacements, container)) {
      return targetValue
    }
  }

  return currentValue
}

function expandAnchorsWithPlacement(anchors: Anchor[], placed: CandidatePlacement) {
  const right = placed.xCm + placed.lengthCm
  const front = placed.yCm + placed.widthCm
  const top = placed.zCm + placed.heightCm

  return dedupeAnchors([
    ...anchors,
    { xCm: right, yCm: placed.yCm, zCm: placed.zCm },
    { xCm: placed.xCm, yCm: front, zCm: placed.zCm },
    { xCm: right, yCm: front, zCm: placed.zCm },
    { xCm: placed.xCm, yCm: placed.yCm, zCm: top },
    { xCm: right, yCm: placed.yCm, zCm: top },
    { xCm: placed.xCm, yCm: front, zCm: top },
    { xCm: right, yCm: front, zCm: top },
    ...anchors.flatMap((anchor) =>
      anchor.zCm === placed.zCm
        ? [
            { xCm: right, yCm: anchor.yCm, zCm: anchor.zCm },
            { xCm: anchor.xCm, yCm: front, zCm: anchor.zCm },
          ]
        : [],
    ),
  ])
}

function getSupplierPools(units: ExpandedUnitPreview[], loadPriority: LoadPriority) {
  const selfUnits = units.filter((unit) => unit.supplierFlag === 'self')
  const otherUnits = units.filter((unit) => unit.supplierFlag === 'other')

  if (loadPriority === 'other_first') {
    return [otherUnits, selfUnits].filter((pool) => pool.length > 0)
  }

  return [selfUnits, otherUnits].filter((pool) => pool.length > 0)
}

function preferredSupplierFlag(loadPriority: LoadPriority): SupplierFlag {
  return loadPriority === 'other_first' ? 'other' : 'self'
}

function supplierPriority(unit: ExpandedUnit, loadPriority: LoadPriority = 'self_first') {
  if (loadPriority === 'balanced') {
    return 0
  }
  return unit.supplierFlag === preferredSupplierFlag(loadPriority) ? -1 : 1
}
