import {
  calculateItemCbm,
  generateContainerPlanCandidates,
  getContainerDimensions,
  getExpandedUnitPreview,
  type ExpandedUnitPreview,
  type MultiContainerBatch,
  type MultiContainerPlan,
  type Dimension3D,
  type ContainerPlanCandidate,
  type ContainerType,
  type ItemInput,
  type SplitMode,
  generateContainerPlanCandidatesForUnits,
} from './containerPlanner'

export interface OllamaPackingResponse {
  candidateId: string | null
  explanation: string[]
}

export interface OllamaPackingPlan {
  plan: ContainerPlanCandidate['plan']
  explanation: string[]
  candidateId: string | null
  model: string
}

export interface OllamaMultiContainerPlan {
  plan: MultiContainerPlan
  batchExplanations: Record<string, string[]>
  model: string
}

export function buildOllamaPackingPrompt({
  containerType,
  container,
  candidates,
}: {
  containerType: ContainerType
  container: { lengthCm: number; widthCm: number; heightCm: number }
  candidates: Array<{
    candidateId: string
    strategyLabel: string
    utilizationRatio: number
    unpackedItems: number
    floorPlacements: number
    stackedPlacements: number
    sequencePreview: string[]
  }>
}) {
  const lines = candidates.map(
    (candidate) =>
      [
        `- ${candidate.candidateId} | ${candidate.strategyLabel}`,
        `  利用率: ${(candidate.utilizationRatio * 100).toFixed(1)}%`,
        `  未装入件数: ${candidate.unpackedItems}`,
        `  底层件数: ${candidate.floorPlacements}`,
        `  叠层件数: ${candidate.stackedPlacements}`,
        `  顺序预览: ${candidate.sequencePreview.join(', ')}`,
      ].join('\n'),
  )

  return [
    '你是装柜方案评审助手。请从候选装柜方案里选出最合理的一套。',
    '目标：优先铺底、减少底部空洞、尽量降低悬空感，并保持空间利用率尽可能高。',
    `货柜类型：${containerType}`,
    `货柜内尺寸：${container.lengthCm}×${container.widthCm}×${container.heightCm}cm`,
    '候选方案列表：',
    ...lines,
    '请仅返回 JSON，格式如下：',
    '{"candidateId":"volume-desc","explanation":["原因1","原因2"]}',
    'candidateId 必须只使用上面提供的候选方案 ID，不要新增或改写。',
  ].join('\n')
}

export function parseOllamaPackingResponse(raw: string): OllamaPackingResponse {
  const parsed = JSON.parse(raw) as {
    candidateId?: unknown
    explanation?: unknown
  }

  const candidateId = typeof parsed.candidateId === 'string' ? parsed.candidateId : null
  const explanation = Array.isArray(parsed.explanation)
    ? parsed.explanation.filter((value): value is string => typeof value === 'string')
    : []

  return {
    candidateId,
    explanation,
  }
}

function buildCandidateSummaries(candidates: ContainerPlanCandidate[]) {
  return candidates.map((candidate) => ({
    candidateId: candidate.candidateId,
    strategyLabel: candidate.strategyLabel,
    utilizationRatio: candidate.plan.summary.utilizationRatio,
    unpackedItems: candidate.plan.summary.unpackedItems,
    floorPlacements: candidate.plan.placements.filter((placement) => placement.zCm === 0).length,
    stackedPlacements: candidate.plan.placements.filter((placement) => placement.zCm > 0).length,
    sequencePreview: candidate.plan.placements
      .slice(0, 5)
      .map((placement) => `${placement.itemId}-${placement.index}`),
  }))
}

function createMultiPlanSummary({
  containerType,
  customContainer,
  allUnits,
  batches,
  remaining,
}: {
  containerType: ContainerType
  customContainer?: Dimension3D
  allUnits: ExpandedUnitPreview[]
  batches: MultiContainerBatch[]
  remaining: ExpandedUnitPreview[]
}): MultiContainerPlan {
  const container = getContainerDimensions(containerType, customContainer)
  const bareCbm = allUnits.reduce((sum, unit) => sum + calculateItemCbm(unit.bare), 0)
  const packedCbm = allUnits.reduce((sum, unit) => sum + calculateItemCbm(unit.packed), 0)
  const containerCbm = calculateItemCbm(container)
  const totalPlacedPackedCbm = batches.reduce(
    (sum, batch) => sum + batch.plan.summary.utilizationRatio * batch.plan.summary.containerCbm,
    0,
  )
  const packedUnits = batches.reduce((sum, batch) => sum + batch.plan.placements.length, 0)

  return {
    containerType,
    container,
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
      utilizationRatio:
        batches.length > 0 ? totalPlacedPackedCbm / (containerCbm * batches.length) : 0,
      unpackedItems: remaining.length,
    },
  }
}

export async function requestOllamaPackingPlan({
  containerType,
  items,
  model,
  baseUrl = 'http://127.0.0.1:11434',
  customContainer,
}: {
  containerType: ContainerType
  items: ItemInput[]
  model: string
  baseUrl?: string
  customContainer?: Dimension3D
}): Promise<OllamaPackingPlan> {
  const container = getContainerDimensions(containerType, customContainer)
  const candidates = generateContainerPlanCandidates({
    containerType,
    items,
    customContainer,
  })
  const candidateSummaries = buildCandidateSummaries(candidates)
  const response = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      stream: false,
      format: 'json',
      prompt: buildOllamaPackingPrompt({
        containerType,
        container,
        candidates: candidateSummaries,
      }),
    }),
  })

  if (!response.ok) {
    throw new Error(`Qwen 方案请求失败（${response.status}）`)
  }

  const payload = (await response.json()) as { response?: string }
  if (!payload.response) {
    throw new Error('Qwen 没有返回可解析的装柜方案')
  }

  const parsed = parseOllamaPackingResponse(payload.response)
  const chosenCandidate =
    candidates.find((candidate) => candidate.candidateId === parsed.candidateId) ?? candidates[0]

  return {
    plan: chosenCandidate.plan,
    explanation: parsed.explanation,
    candidateId: chosenCandidate.candidateId,
    model,
  }
}

export async function requestOllamaMultiContainerPlan({
  containerType,
  items,
  model,
  baseUrl = 'http://127.0.0.1:11434',
  customContainer,
  splitMode = 'mixed',
}: {
  containerType: ContainerType
  items: ItemInput[]
  model: string
  baseUrl?: string
  customContainer?: Dimension3D
  splitMode?: SplitMode
}): Promise<OllamaMultiContainerPlan> {
  const container = getContainerDimensions(containerType, customContainer)
  const allUnits = getExpandedUnitPreview(items)
  const batches: MultiContainerBatch[] = []
  const batchExplanations: Record<string, string[]> = {}
  let remaining = [...allUnits]
  const pools = splitMode === 'separate_suppliers'
    ? [
        remaining.filter((unit) => unit.supplierFlag === 'self'),
        remaining.filter((unit) => unit.supplierFlag === 'other'),
      ].filter((pool) => pool.length > 0)
    : [remaining]

  for (const pool of pools) {
    let poolRemaining = [...pool]

    while (poolRemaining.length > 0) {
      const candidates = generateContainerPlanCandidatesForUnits({
        containerType,
        units: poolRemaining,
        customContainer,
      })
      const candidateSummaries = buildCandidateSummaries(candidates)
      const viableCandidates = candidates.filter((candidate) => candidate.plan.placements.length > 0)

      if (viableCandidates.length === 0) {
        break
      }

      const response = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          stream: false,
          format: 'json',
          prompt: [
            `当前正在规划第 ${batches.length + 1} 柜。`,
            splitMode === 'separate_suppliers'
              ? `本轮只允许处理${poolRemaining[0]?.supplierFlag === 'other' ? '第三方' : '己方'}货物，不能与另一类供应商混装。`
              : '当前允许己方与第三方货物混装，但会兼顾拼柜可读性。',
            buildOllamaPackingPrompt({
              containerType,
              container,
              candidates: candidateSummaries,
            }),
          ].join('\n'),
        }),
      })

      if (!response.ok) {
        throw new Error(`Qwen 多柜方案请求失败（${response.status}）`)
      }

      const payload = (await response.json()) as { response?: string }
      if (!payload.response) {
        throw new Error('Qwen 没有返回可解析的多柜方案')
      }

      const parsed = parseOllamaPackingResponse(payload.response)
      const chosenCandidate =
        viableCandidates.find((candidate) => candidate.candidateId === parsed.candidateId) ??
        viableCandidates[0]
      const batchId = `batch-${batches.length + 1}`

      batches.push({
        batchId,
        containerIndex: batches.length + 1,
        strategyLabel: chosenCandidate.strategyLabel,
        candidateId: chosenCandidate.candidateId,
        units: poolRemaining.filter((unit) =>
          chosenCandidate.plan.placements.some(
            (placement) => `${placement.itemId}-${placement.index}` === unit.unitKey,
          ),
        ),
        plan: chosenCandidate.plan,
      })
      batchExplanations[batchId] = parsed.explanation

      const packedKeys = new Set(
        chosenCandidate.plan.placements.map((placement) => `${placement.itemId}-${placement.index}`),
      )
      poolRemaining = poolRemaining.filter((unit) => !packedKeys.has(unit.unitKey))
      remaining = remaining.filter((unit) => !packedKeys.has(unit.unitKey))
    }
  }

  return {
    plan: createMultiPlanSummary({
      containerType,
      customContainer,
      allUnits,
      batches,
      remaining,
    }),
    batchExplanations,
    model,
  }
}
