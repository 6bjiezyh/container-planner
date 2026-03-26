import {
  calculateMultiContainerPlan,
  generatePackingSequence,
  recommendContainerPlans,
  type ContainerRecommendation,
  type ContainerType,
  type Dimension3D,
  type ItemInput,
  type LoadPriority,
  type MultiContainerPlan,
  type PackingSequenceStep,
  type RemainingSpaceInput,
  type SplitMode,
} from '../lib/containerPlanner'

export interface PlannerWorkerRequest {
  containerType: ContainerType
  items: ItemInput[]
  customContainer?: Dimension3D
  splitMode: SplitMode
  remainingSpace: RemainingSpaceInput
  loadPriority: LoadPriority
  shouldLimitRecommendations: boolean
}

export interface PlannerWorkerResponse {
  algorithmPlan: MultiContainerPlan
  packingSequence: PackingSequenceStep[]
  recommendedContainers: ContainerRecommendation[]
}

self.onmessage = (event: MessageEvent<PlannerWorkerRequest>) => {
  const {
    containerType,
    items,
    customContainer,
    splitMode,
    remainingSpace,
    loadPriority,
    shouldLimitRecommendations,
  } = event.data

  const algorithmPlan = calculateMultiContainerPlan({
    containerType,
    items,
    customContainer,
    splitMode,
    remainingSpace,
    loadPriority,
  })

  const packingSequence = generatePackingSequence(items, loadPriority)

  const recommendedContainers = shouldLimitRecommendations
    ? [
        {
          containerType,
          plan: algorithmPlan,
          score: Number.MAX_SAFE_INTEGER,
        },
      ]
    : recommendContainerPlans({ items, splitMode, remainingSpace, loadPriority }).slice(0, 3)

  const response: PlannerWorkerResponse = {
    algorithmPlan,
    packingSequence,
    recommendedContainers,
  }

  self.postMessage(response)
}
