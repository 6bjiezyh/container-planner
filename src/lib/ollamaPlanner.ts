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
  type LoadPriority,
  type RemainingSpaceInput,
  type SplitMode,
  generateContainerPlanCandidatesForUnits,
  resolvePackingSpace,
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

function normalizeExplanationLine(line: string) {
  return line
    .replace(/^[\s•·\-—\d.、()（）]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function sanitizeExplanation(explanation: unknown) {
  const rawLines = Array.isArray(explanation)
    ? explanation.filter((value): value is string => typeof value === 'string')
    : typeof explanation === 'string'
      ? explanation.split(/\r?\n+/)
      : []

  const seen = new Set<string>()
  const normalized: string[] = []

  for (const rawLine of rawLines) {
    const line = normalizeExplanationLine(rawLine)
    if (!line) {
      continue
    }

    const dedupeKey = line.replace(/[，。,.!！?？:：;；\s]+/g, '').toLowerCase()
    if (seen.has(dedupeKey)) {
      continue
    }

    seen.add(dedupeKey)
    normalized.push(line)

    if (normalized.length >= 4) {
      break
    }
  }

  return normalized
}

export function buildOllamaPackingPrompt({
  containerType,
  container,
  candidates,
  loadPriority = 'self_first',
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
    usedLengthCm: number
    tailFreeLengthCm: number
    usedHeightCm: number
    sequencePreview: string[]
  }>
  loadPriority?: LoadPriority
}) {
  const lines = candidates.map(
    (candidate) =>
      [
        `- ${candidate.candidateId} | ${candidate.strategyLabel}`,
        `  利用率: ${(candidate.utilizationRatio * 100).toFixed(1)}%`,
        `  未装入件数: ${candidate.unpackedItems}`,
        `  底层件数: ${candidate.floorPlacements}`,
        `  叠层件数: ${candidate.stackedPlacements}`,
        `  已用长度: ${candidate.usedLengthCm}cm`,
        `  预留尾仓长度: ${candidate.tailFreeLengthCm}cm`,
        `  最高装载高度: ${candidate.usedHeightCm}cm`,
        `  顺序预览: ${candidate.sequencePreview.join(', ')}`,
      ].join('\n'),
  )

  return [
    '你是装柜方案评审助手。请从候选装柜方案里选出最合理的一套。',
    '目标：装柜顺序要从柜内深处往门口推进，优先高件和重件，重在下轻在上，并在稳定前提下主动堆叠。',
    '请尽量把剩余空间整块留在靠门一侧，方便物流后续继续补货或拼柜，不要为了保守而把货全部摊平。',
    loadPriority === 'other_first'
      ? '当前业务偏好：第三方货优先装入，己方货尽量靠门后装。'
      : loadPriority === 'balanced'
        ? '当前业务偏好：己方与第三方货物平衡混装，优先看空间利用率与可读性。'
        : '当前业务偏好：己方货优先装入，第三方货尽量靠门后装。',
    'explanation 最多返回 4 条，每条一句话，避免重复表达同一含义，不要写套话。',
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
  const explanation = sanitizeExplanation(parsed.explanation)

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
    usedLengthCm: Math.max(
      ...candidate.plan.placements.map((placement) => placement.xCm + placement.lengthCm),
      0,
    ),
    tailFreeLengthCm: Math.max(
      candidate.plan.packingSpace.lengthCm -
        Math.max(
          ...candidate.plan.placements.map((placement) => placement.xCm + placement.lengthCm),
          0,
        ),
      0,
    ),
    usedHeightCm: Math.max(
      ...candidate.plan.placements.map((placement) => placement.zCm + placement.heightCm),
      0,
    ),
    sequencePreview: candidate.plan.placements
      .slice(0, 5)
      .map((placement) => `${placement.itemId}-${placement.index}`),
  }))
}

function createMultiPlanSummary({
  containerType,
  customContainer,
  remainingSpace,
  allUnits,
  batches,
  remaining,
}: {
  containerType: ContainerType
  customContainer?: Dimension3D
  remainingSpace?: RemainingSpaceInput
  allUnits: ExpandedUnitPreview[]
  batches: MultiContainerBatch[]
  remaining: ExpandedUnitPreview[]
}): MultiContainerPlan {
  const container = getContainerDimensions(containerType, customContainer)
  const packingSpace = resolvePackingSpace({ container, remainingSpace })
  const bareCbm = allUnits.reduce((sum, unit) => sum + calculateItemCbm(unit.bare), 0)
  const packedCbm = allUnits.reduce((sum, unit) => sum + calculateItemCbm(unit.packed), 0)
  const containerCbm = calculateItemCbm(packingSpace)
  const totalPlacedPackedCbm = batches.reduce(
    (sum, batch) => sum + batch.plan.summary.utilizationRatio * batch.plan.summary.containerCbm,
    0,
  )
  const packedUnits = batches.reduce((sum, batch) => sum + batch.plan.placements.length, 0)

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
  remainingSpace,
}: {
  containerType: ContainerType
  items: ItemInput[]
  model: string
  baseUrl?: string
  customContainer?: Dimension3D
  remainingSpace?: RemainingSpaceInput
}): Promise<OllamaPackingPlan> {
  const container = getContainerDimensions(containerType, customContainer)
  const packingSpace = resolvePackingSpace({ container, remainingSpace })
  const candidates = generateContainerPlanCandidates({
    containerType,
    items,
    customContainer,
    remainingSpace,
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
        container: packingSpace,
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
  remainingSpace,
  loadPriority = 'self_first',
}: {
  containerType: ContainerType
  items: ItemInput[]
  model: string
  baseUrl?: string
  customContainer?: Dimension3D
  splitMode?: SplitMode
  remainingSpace?: RemainingSpaceInput
  loadPriority?: LoadPriority
}): Promise<OllamaMultiContainerPlan> {
  const container = getContainerDimensions(containerType, customContainer)
  const packingSpace = resolvePackingSpace({ container, remainingSpace })
  const allUnits = getExpandedUnitPreview(items)
  const batches: MultiContainerBatch[] = []
  const batchExplanations: Record<string, string[]> = {}
  let remaining = [...allUnits]
  const pools = splitMode === 'separate_suppliers'
    ? loadPriority === 'other_first'
      ? [
          remaining.filter((unit) => unit.supplierFlag === 'other'),
          remaining.filter((unit) => unit.supplierFlag === 'self'),
        ].filter((pool) => pool.length > 0)
      : [
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
        remainingSpace,
        loadPriority,
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
              container: packingSpace,
              candidates: candidateSummaries,
              loadPriority,
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
      remainingSpace,
      allUnits,
      batches,
      remaining,
    }),
    batchExplanations,
    model,
  }
}
