import { useEffect, useRef, useState } from 'react'
import './App.css'
import {
  calculateContainerPlanWithSequenceForUnits,
  calculateItemCbm,
  estimatePlacementCount,
  getContainerDimensions,
  getContainerLabel,
  nudgePlacementInPlan,
  resolveItemDimensions,
  type BoxContentEntry,
  type ContainerRecommendation,
  type ContainerType,
  type Dimension3D,
  type DimensionInputMode,
  type ItemInput,
  type LoadPriority,
  type MultiContainerPlan,
  type PackingSequenceStep,
  type PackagingType,
  type PlacementAxis,
  type RemainingSpaceInput,
  type SplitMode,
  type SupplierFlag,
} from './lib/containerPlanner'
import { exportPlanAsGif } from './lib/exportGif'
import { exportPlanAsStandaloneHtml } from './lib/exportEmbedHtml'
import { ScenePreview } from './components/ScenePreview'
import { createSceneData } from './lib/sceneData'
import {
  requestOllamaMultiContainerPlan,
  type OllamaMultiContainerPlan,
} from './lib/ollamaPlanner'
import { importPackingListFile } from './lib/packingListImport'
import type { PlannerWorkerRequest, PlannerWorkerResponse } from './workers/plannerWorker'

type CustomContainerPreset = {
  id: string
  name: string
  dimensions: Dimension3D
}

const CUSTOM_CONTAINER_PRESET_STORAGE_KEY = 'container-planner-custom-presets'
const DEFAULT_CARTON_THICKNESS_CM = 0.5
const DEFAULT_FOAM_THICKNESS_CM = 2
const DEFAULT_WOOD_FRAME_THICKNESS_CM = 2
const DEFAULT_WOOD_CRATE_THICKNESS_CM = 3
const MAX_RECOMMENDATION_PLACEMENTS = 24
const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434'
const DEFAULT_QWEN_MODEL = 'qwen3:8b'

function runPlannerWorker(payload: PlannerWorkerRequest) {
  return new Promise<PlannerWorkerResponse>((resolve, reject) => {
    const worker = new Worker(new URL('./workers/plannerWorker.ts', import.meta.url), {
      type: 'module',
    })

    worker.onmessage = (event: MessageEvent<PlannerWorkerResponse>) => {
      resolve(event.data)
      worker.terminate()
    }

    worker.onerror = (event) => {
      reject(event.error ?? new Error('装柜计算 Worker 执行失败'))
      worker.terminate()
    }

    worker.postMessage(payload)
  })
}

function App() {
  const [containerType, setContainerType] = useState<ContainerType>('40HQ')
  const [splitMode, setSplitMode] = useState<SplitMode>('mixed')
  const [loadPriority, setLoadPriority] = useState<LoadPriority>('self_first')
  const [planReference, setPlanReference] = useState('')
  const [customContainer, setCustomContainer] = useState<Dimension3D>({
    lengthCm: 1203,
    widthCm: 235,
    heightCm: 269,
  })
  const [remainingSpace, setRemainingSpace] = useState<RemainingSpaceInput>({
    enabled: false,
    lengthCm: 1203,
    widthCm: 235,
    heightCm: 269,
  })
  const [customContainerName, setCustomContainerName] = useState('')
  const [customContainerPresets, setCustomContainerPresets] = useState<CustomContainerPreset[]>(() => {
    if (typeof window === 'undefined') {
      return []
    }

    try {
      const raw = window.localStorage.getItem(CUSTOM_CONTAINER_PRESET_STORAGE_KEY)
      if (!raw) {
        return []
      }
      const parsed = JSON.parse(raw) as CustomContainerPreset[]
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  })
  const [items, setItems] = useState<ItemInput[]>([createDefaultItem('主货物')])
  const [expandedItemIds, setExpandedItemIds] = useState<string[]>([])
  const [algorithmPlan, setAlgorithmPlan] = useState<MultiContainerPlan | null>(null)
  const [qwenPlan, setQwenPlan] = useState<OllamaMultiContainerPlan | null>(null)
  const [qwenModel, setQwenModel] = useState(DEFAULT_QWEN_MODEL)
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState(DEFAULT_OLLAMA_BASE_URL)
  const [isPlanningLoading, setIsPlanningLoading] = useState(false)
  const [isQwenLoading, setIsQwenLoading] = useState(false)
  const [qwenError, setQwenError] = useState<string | null>(null)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [calculationMessage, setCalculationMessage] = useState<string | null>(null)
  const itemsListRef = useRef<HTMLDivElement | null>(null)

  const resolvedCustomContainer = containerType === 'CUSTOM' ? customContainer : undefined
  const container = getContainerDimensions(containerType, resolvedCustomContainer)
  const [recommendedContainers, setRecommendedContainers] = useState<ContainerRecommendation[]>([])
  const [packingSequence, setPackingSequence] = useState<PackingSequenceStep[]>([])
  const totalBareCbm = items.reduce(
    (sum, item) =>
      sum +
      calculateItemCbm({
        lengthCm: item.lengthCm,
        widthCm: item.widthCm,
        heightCm: item.heightCm,
        quantity: item.dimensionInputMode === 'outer_box' ? item.boxCount ?? 1 : item.quantity,
      }),
    0,
  )

  useEffect(() => {
    setRemainingSpace((current) => ({
      ...current,
      lengthCm: Math.min(current.lengthCm, container.lengthCm),
      widthCm: Math.min(current.widthCm, container.widthCm),
      heightCm: Math.min(current.heightCm, container.heightCm),
    }))
  }, [container.lengthCm, container.widthCm, container.heightCm])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(
      CUSTOM_CONTAINER_PRESET_STORAGE_KEY,
      JSON.stringify(customContainerPresets),
    )
  }, [customContainerPresets])

  useEffect(() => {
    if (items.length === 0) {
      setExpandedItemIds([])
      return
    }

    setExpandedItemIds((current) => {
      if (current.length > 0) {
        return current.filter((itemId) => items.some((item) => item.id === itemId))
      }

      return [items[0].id]
    })
  }, [items])

  function updateItem(
    itemId: string,
    field: keyof ItemInput,
    value: string | number | boolean | PackagingType | DimensionInputMode | SupplierFlag,
  ) {
    setItems((current) =>
      current.map((item) => {
        if (item.id !== itemId) {
          return item
        }

        const nextItem = {
          ...item,
          [field]: value,
        }

        if (field === 'packagingType') {
          const packagingType = value as PackagingType
          if (packagingType === 'wood_frame') {
            nextItem.woodThicknessCm = DEFAULT_WOOD_FRAME_THICKNESS_CM
          } else if (packagingType === 'wood_crate') {
            nextItem.woodThicknessCm = DEFAULT_WOOD_CRATE_THICKNESS_CM
          } else {
            nextItem.woodThicknessCm = 0
          }
        }

        if (field === 'cartonEnabled' && value === true && nextItem.cartonThicknessCm <= 0) {
          nextItem.cartonThicknessCm = DEFAULT_CARTON_THICKNESS_CM
        }

        if (field === 'foamEnabled' && value === true && nextItem.foamThicknessCm <= 0) {
          nextItem.foamThicknessCm = DEFAULT_FOAM_THICKNESS_CM
        }

        return nextItem
      }),
    )
  }

  function applyPackagingDefaults(itemId: string) {
    setItems((current) =>
      current.map((item) => {
        if (item.id !== itemId) {
          return item
        }

        return {
          ...item,
          woodThicknessCm:
            item.packagingType === 'wood_crate'
              ? DEFAULT_WOOD_CRATE_THICKNESS_CM
              : item.packagingType === 'wood_frame'
                ? DEFAULT_WOOD_FRAME_THICKNESS_CM
                : 0,
          cartonThicknessCm: item.cartonEnabled
            ? DEFAULT_CARTON_THICKNESS_CM
            : item.cartonThicknessCm,
          foamThicknessCm: item.foamEnabled ? DEFAULT_FOAM_THICKNESS_CM : item.foamThicknessCm,
        }
      }),
    )
  }

  function addItem() {
    const nextItem = createDefaultItem(`货物 ${items.length + 1}`)
    setItems((current) => [...current, nextItem])
    setExpandedItemIds((current) => [...current, nextItem.id])
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        itemsListRef.current?.scrollTo({
          top: itemsListRef.current.scrollHeight,
          behavior: 'smooth',
        })
      })
    })
  }

  function removeItem(itemId: string) {
    setItems((current) => current.filter((item) => item.id !== itemId))
    setExpandedItemIds((current) => current.filter((currentId) => currentId !== itemId))
  }

  function saveCustomContainerPreset() {
    if (!customContainerName.trim()) {
      return
    }

    const normalizedName = customContainerName.trim()
    setCustomContainerPresets((current) => {
      const existing = current.find(
        (preset) => preset.name.toLowerCase() === normalizedName.toLowerCase(),
      )
      if (existing) {
        return current.map((preset) =>
          preset.id === existing.id
            ? {
                ...preset,
                name: normalizedName,
                dimensions: customContainer,
              }
            : preset,
        )
      }

      return [
        ...current,
        {
          id: crypto.randomUUID(),
          name: normalizedName,
          dimensions: customContainer,
        },
      ]
    })
    setCustomContainerName('')
  }

  function applyCustomContainerPreset(presetId: string) {
    const preset = customContainerPresets.find((candidate) => candidate.id === presetId)
    if (!preset) {
      return
    }

    setContainerType('CUSTOM')
    setCustomContainer(preset.dimensions)
    setCustomContainerName(preset.name)
  }

  function deleteCustomContainerPreset(presetId: string) {
    setCustomContainerPresets((current) => current.filter((preset) => preset.id !== presetId))
  }

  function moveItem(itemId: string, direction: 'up' | 'down') {
    setItems((current) => {
      const index = current.findIndex((item) => item.id === itemId)
      if (index === -1) return current

      const nextIndex = direction === 'up' ? index - 1 : index + 1
      if (nextIndex < 0 || nextIndex >= current.length) {
        return current
      }

      const next = [...current]
      ;[next[index], next[nextIndex]] = [next[nextIndex], next[index]]
      return next
    })
  }

  async function handleCalculate() {
    const placementCount = estimatePlacementCount(items)
    const shouldLimitRecommendations = placementCount > MAX_RECOMMENDATION_PLACEMENTS

    setIsPlanningLoading(true)
    setCalculationMessage(
      shouldLimitRecommendations
        ? `当前装箱单共有 ${placementCount} 个待装箱体。为避免浏览器卡顿，本次只计算当前柜型，已跳过全柜型推荐。`
        : null,
    )
    setRecommendedContainers([])
    setPackingSequence([])
    setAlgorithmPlan(null)
    setQwenPlan(null)
    setQwenError(null)
    setIsQwenLoading(false)

    try {
      const {
        algorithmPlan: nextAlgorithmPlan,
        packingSequence: nextPackingSequence,
        recommendedContainers: nextRecommendedContainers,
      } = await runPlannerWorker({
        containerType,
        items,
        customContainer: resolvedCustomContainer,
        splitMode,
        remainingSpace,
        loadPriority,
        shouldLimitRecommendations,
      })

      setAlgorithmPlan(nextAlgorithmPlan)
      setPackingSequence(nextPackingSequence)
      setRecommendedContainers(nextRecommendedContainers)
    } catch (error) {
      setIsPlanningLoading(false)
      setCalculationMessage(
        error instanceof Error ? `装柜计算失败：${error.message}` : '装柜计算失败，请重试。',
      )
      return
    }

    setIsPlanningLoading(false)
    setIsQwenLoading(true)

    try {
      const nextQwenPlan = await requestOllamaMultiContainerPlan({
        containerType,
        items,
        model: qwenModel,
        baseUrl: ollamaBaseUrl,
        customContainer: resolvedCustomContainer,
        splitMode,
        remainingSpace,
        loadPriority,
      })
      setQwenPlan(nextQwenPlan)
    } catch (error) {
      setQwenError(error instanceof Error ? error.message : 'Qwen 方案生成失败')
    } finally {
      setIsQwenLoading(false)
    }
  }

  async function handleImport(file: File | null) {
    if (!file) {
      return
    }

    try {
      const importedItems = await importPackingListFile(file)
      setItems(importedItems)
      setExpandedItemIds(importedItems.slice(0, 3).map((item) => item.id))
      setAlgorithmPlan(null)
      setQwenPlan(null)
      setQwenError(null)
      setRecommendedContainers([])
      setPackingSequence([])
      setCalculationMessage(null)
      setPlanReference(file.name.replace(/\.[^.]+$/, ''))
      setImportMessage(
        `已导入 ${importedItems.length} 条货物。为避免大装箱单卡顿，请点击“生成双方案”后再计算推荐柜型和动画。`,
      )
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : '装箱单导入失败')
    }
  }

  function toggleItemExpanded(itemId: string) {
    setExpandedItemIds((current) =>
      current.includes(itemId)
        ? current.filter((currentId) => currentId !== itemId)
        : [...current, itemId],
    )
  }

  function expandAllItems() {
    setExpandedItemIds(items.map((item) => item.id))
  }

  function collapseAllItems() {
    setExpandedItemIds(items.slice(0, 1).map((item) => item.id))
  }

  function restoreQwenDefaults() {
    setOllamaBaseUrl(DEFAULT_OLLAMA_BASE_URL)
    setQwenModel(DEFAULT_QWEN_MODEL)
  }

  return (
    <main className="app-shell app-shell-compare">
      <section className="panel panel-left">
        <div className="panel-header">
          <p className="eyebrow">Container Planning Copilot</p>
          <h1>物流体积计算与双方案装柜动画</h1>
          <p className="lede">
            同一组参数同时交给本地装箱算法和 Ollama 里的 Qwen，输出两套装柜顺序和两张 GIF 结果做对比。
          </p>
        </div>

        <div className="field-group">
          <div className="section-title">
            <h2>方案信息</h2>
          </div>
          <div className="dimensions-grid dimensions-grid-two">
            <label>
              订单/方案编号
              <input
                type="text"
                value={planReference}
                onChange={(event) => setPlanReference(event.target.value)}
                placeholder="例如 ZY-2026-031"
              />
            </label>
            <label>
              当前柜型尺寸
              <input
                type="text"
                value={`${container.lengthCm}×${container.widthCm}×${container.heightCm}cm`}
                readOnly
              />
            </label>
          </div>
          <p className="hint">
            订单/方案编号会带入 GIF 与 HTML 导出文件名，方便后续对接独立站或归档。
          </p>
        </div>

        <div className="field-group">
          <div className="section-title">
            <h2>装箱单导入</h2>
          </div>
          <div className="import-row">
            <label className="secondary-button import-button">
              导入固定格式装箱单
              <input
                accept=".xls,.xlsx"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null
                  void handleImport(file)
                  event.currentTarget.value = ''
                }}
                type="file"
              />
            </label>
            {importMessage ? <span className="import-message">{importMessage}</span> : null}
          </div>
          <p className="hint">
            支持固定格式 Excel 装箱单导入。若表格里长宽高是外箱尺寸，系统会自动按外箱模式导入，后续仍可人工修改包装参数。
          </p>
        </div>

        <div className="field-group">
          <div className="section-title">
            <h2>柜型推荐</h2>
          </div>
          {calculationMessage ? <p className="hint">{calculationMessage}</p> : null}
          <div className="recommendation-list">
            {recommendedContainers.length === 0 ? (
              <p className="hint">导入或修改数据后，点击“生成双方案”再刷新推荐柜型。</p>
            ) : (
              recommendedContainers.map((recommendation, index) => (
                <button
                  key={recommendation.containerType}
                  className={
                    recommendation.containerType === containerType
                      ? 'recommendation-card active'
                      : 'recommendation-card'
                  }
                  onClick={() => setContainerType(recommendation.containerType)}
                  type="button"
                >
                  <div className="recommendation-rank">TOP {index + 1}</div>
                  <strong>{getContainerLabel(recommendation.containerType)}</strong>
                  <small>
                    {recommendation.plan.summary.totalContainers} 柜 · 利用率{' '}
                    {(recommendation.plan.summary.utilizationRatio * 100).toFixed(1)}%
                  </small>
                  <small>
                    未装入 {recommendation.plan.summary.unpackedItems} 件 / 已装入{' '}
                    {recommendation.plan.summary.packedUnits} 件
                  </small>
                </button>
              ))
            )}
          </div>
          <p className="hint">
            推荐逻辑会在常见车柜里比较总柜数、未装入件数与平均利用率，优先推荐能装下且柜数更少的方案。
          </p>
        </div>

        <div className="field-group">
          <div className="section-title">
            <h2>分柜 / 拼柜策略</h2>
          </div>
          <div className="choice-grid">
            {([
              { id: 'mixed', label: '允许混装' },
              { id: 'separate_suppliers', label: '按供应商分柜' },
            ] as Array<{ id: SplitMode; label: string }>).map((option) => (
              <button
                key={option.id}
                className={splitMode === option.id ? 'chip active' : 'chip'}
                onClick={() => setSplitMode(option.id)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="hint">
            允许混装时，己方与第三方货物可以同柜优化利用率；按供应商分柜时，系统会先装己方，再单独拆分第三方货物，便于拼柜与对账。
          </p>
        </div>

        <div className="field-group">
          <div className="section-title">
            <h2>装柜优先级</h2>
          </div>
          <div className="choice-grid">
            {([
              { id: 'self_first', label: '己方优先' },
              { id: 'other_first', label: '第三方优先' },
              { id: 'balanced', label: '平衡混装' },
            ] as Array<{ id: LoadPriority; label: string }>).map((option) => (
              <button
                key={option.id}
                className={loadPriority === option.id ? 'chip active' : 'chip'}
                onClick={() => setLoadPriority(option.id)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="hint">
            客户如果在装箱单备注列写“第三方”，系统会自动归类。这里再决定本轮装柜时优先装己方、优先装第三方，还是平衡混装。
          </p>
        </div>

        <div className="field-group">
          <label>货柜类型</label>
          <div className="choice-grid">
            {(['20GP', '40GP', '40HQ', '4.2M_TRUCK', '6.8M_TRUCK', '9.6M_TRUCK', 'CUSTOM'] as ContainerType[]).map(
              (type) => (
                <button
                  key={type}
                  className={type === containerType ? 'chip active' : 'chip'}
                  onClick={() => setContainerType(type)}
                  type="button"
                >
                  {type === 'CUSTOM' ? '自定义柜型' : type}
                </button>
              ),
            )}
          </div>
          <p className="hint">
            内尺寸 {container.lengthCm} × {container.widthCm} × {container.heightCm} cm
          </p>
          {containerType === 'CUSTOM' ? (
            <>
              <div className="dimensions-grid dimensions-grid-three">
                <label>
                  自定义长(cm)
                  <input
                    type="number"
                    value={customContainer.lengthCm}
                    onChange={(event) =>
                      setCustomContainer((current) => ({
                        ...current,
                        lengthCm: Number(event.target.value),
                      }))
                    }
                  />
                </label>
                <label>
                  自定义宽(cm)
                  <input
                    type="number"
                    value={customContainer.widthCm}
                    onChange={(event) =>
                      setCustomContainer((current) => ({
                        ...current,
                        widthCm: Number(event.target.value),
                      }))
                    }
                  />
                </label>
                <label>
                  自定义高(cm)
                  <input
                    type="number"
                    value={customContainer.heightCm}
                    onChange={(event) =>
                      setCustomContainer((current) => ({
                        ...current,
                        heightCm: Number(event.target.value),
                      }))
                    }
                  />
                </label>
              </div>
              <div className="custom-container-toolbar">
                <label className="custom-container-name">
                  预设名称
                  <input
                    type="text"
                    value={customContainerName}
                    onChange={(event) => setCustomContainerName(event.target.value)}
                  />
                </label>
                <button className="secondary-button" onClick={saveCustomContainerPreset} type="button">
                  保存为预设
                </button>
              </div>
              {customContainerPresets.length > 0 ? (
                <div className="preset-list">
                  {customContainerPresets.map((preset) => (
                    <div className="preset-card" key={preset.id}>
                      <div>
                        <strong>{preset.name}</strong>
                        <small>
                          {preset.dimensions.lengthCm}×{preset.dimensions.widthCm}×{preset.dimensions.heightCm}cm
                        </small>
                      </div>
                      <div className="preset-actions">
                        <button
                          className="ghost-button"
                          onClick={() => applyCustomContainerPreset(preset.id)}
                          type="button"
                        >
                          套用
                        </button>
                        <button
                          className="ghost-button"
                          onClick={() => deleteCustomContainerPreset(preset.id)}
                          type="button"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="hint">可以把常用柜型尺寸保存成预设，后面直接套用。</p>
              )}
            </>
          ) : null}
          <div className="field-group nested-field-group">
            <label className="checkbox-card">
              <input
                checked={remainingSpace.enabled}
                onChange={(event) =>
                  setRemainingSpace((current) => ({
                    ...current,
                    enabled: event.target.checked,
                    lengthCm: Math.min(current.lengthCm || container.lengthCm, container.lengthCm),
                    widthCm: Math.min(current.widthCm || container.widthCm, container.widthCm),
                    heightCm: Math.min(current.heightCm || container.heightCm, container.heightCm),
                  }))
                }
                type="checkbox"
              />
              <div>
                <strong>入口剩余空间模式</strong>
                <span>其他供应商已经占用前半段，只对入口剩余空间继续装货</span>
              </div>
            </label>
            {remainingSpace.enabled ? (
              <>
                <div className="dimensions-grid dimensions-grid-three">
                  <label>
                    剩余长度(cm)
                    <input
                      type="number"
                      max={container.lengthCm}
                      min={1}
                      value={remainingSpace.lengthCm}
                      onChange={(event) =>
                        setRemainingSpace((current) => ({
                          ...current,
                          lengthCm: Number(event.target.value),
                        }))
                      }
                    />
                  </label>
                  <label>
                    剩余宽度(cm)
                    <input
                      type="number"
                      max={container.widthCm}
                      min={1}
                      value={remainingSpace.widthCm}
                      onChange={(event) =>
                        setRemainingSpace((current) => ({
                          ...current,
                          widthCm: Number(event.target.value),
                        }))
                      }
                    />
                  </label>
                  <label>
                    剩余高度(cm)
                    <input
                      type="number"
                      max={container.heightCm}
                      min={1}
                      value={remainingSpace.heightCm}
                      onChange={(event) =>
                        setRemainingSpace((current) => ({
                          ...current,
                          heightCm: Number(event.target.value),
                        }))
                      }
                    />
                  </label>
                </div>
                <p className="hint">
                  系统不会计算其他供应商货物本身，只会把入口剩余空间视为唯一可摆放区域，并在 3D 视图里用红色线框标出。
                </p>
              </>
            ) : null}
          </div>
        </div>

        <div className="items-panel">
          <div className="section-title">
            <h2>货物清单</h2>
            <div className="items-panel-actions">
              <button className="ghost-button" onClick={expandAllItems} type="button">
                全部展开
              </button>
              <button className="ghost-button" onClick={collapseAllItems} type="button">
                收起大部分
              </button>
              <button className="secondary-button" onClick={addItem} type="button">
                新增货物
              </button>
            </div>
          </div>
          <p className="hint">
            当前展开 {expandedItemIds.length} / {items.length} 条。导入大装箱单后默认只展开前几条，避免整页一次性渲染过多表单导致卡顿。
          </p>
          <div className="items-panel-notes">
            <p className="hint">
              定制产品可先录入预估成品尺寸，再勾选纸皮箱、泡沫以及木架/木箱并填写厚度，系统会按层级自动外拓。
            </p>
            <p className="hint">
              直接填写外箱尺寸时，默认按纸皮箱/外箱尺寸计算；如出货前还要加木架或木箱，可继续勾选并填写厚度。
            </p>
            <p className="hint">
              装箱单映射建议：常规货物直接填外箱尺寸；定制产品填预估成品尺寸后再补包装层；备注列写“第三方”会自动归类成第三方货物。
            </p>
          </div>

          <div className="items-panel-list" ref={itemsListRef}>
            {items.map((item, index) => (
              <article className="cargo-card" key={item.id}>
              {(() => {
                const resolved = resolveItemDimensions(item)
                const singlePackedCbm = calculateItemCbm(resolved.packed)
                const isExpanded = expandedItemIds.includes(item.id)
                const supplierLabel = item.supplierFlag === 'other' ? '第三方' : '己方'

                return (
                  <>
              <div className="cargo-card-header">
                <div className="cargo-card-title">
                  <input
                    className="cargo-name"
                    value={item.label}
                    onChange={(event) => updateItem(item.id, 'label', event.target.value)}
                  />
                  <div className="cargo-summary-inline">
                    <span>PI {item.piNo || '-'}</span>
                    <span>编码 {item.productCode || '-'}</span>
                    <span>箱号 {item.boxNo || '-'}</span>
                    <span>{supplierLabel}</span>
                  </div>
                </div>
                <div className="cargo-card-actions">
                  <button
                    className="ghost-button"
                    onClick={() => toggleItemExpanded(item.id)}
                    type="button"
                  >
                    {isExpanded ? '收起明细' : '展开明细'}
                  </button>
                  {items.length > 1 ? (
                    <>
                      <button
                        className="ghost-button"
                        disabled={index === 0}
                        onClick={() => moveItem(item.id, 'up')}
                        type="button"
                      >
                        上移
                      </button>
                      <button
                        className="ghost-button"
                        disabled={index === items.length - 1}
                        onClick={() => moveItem(item.id, 'down')}
                        type="button"
                      >
                        下移
                      </button>
                      <button
                        className="ghost-button"
                        onClick={() => removeItem(item.id)}
                        type="button"
                      >
                        删除
                      </button>
                    </>
                  ) : (
                    <span className="cargo-index">#{index + 1}</span>
                  )}
                </div>
              </div>

              <div className="cargo-summary-grid">
                <div>
                  <span>外尺寸</span>
                  <strong>
                    {resolved.packed.lengthCm}×{resolved.packed.widthCm}×{resolved.packed.heightCm}cm
                  </strong>
                </div>
                <div>
                  <span>数量 / 箱数</span>
                  <strong>
                    {item.quantity} 件 / {item.boxCount ?? 1} 箱
                  </strong>
                </div>
                <div>
                  <span>单件 CBM</span>
                  <strong>{singlePackedCbm.toFixed(3)}</strong>
                </div>
                <div>
                  <span>单箱重量</span>
                  <strong>{(item.singleWeightKg ?? 0).toFixed(1)} kg</strong>
                </div>
              </div>

              {isExpanded ? (
                <>
              <div className="dimensions-grid dimensions-grid-three">
                <label>
                  PI序号
                  <input
                    type="text"
                    value={item.piNo ?? ''}
                    onChange={(event) => updateItem(item.id, 'piNo', event.target.value)}
                  />
                </label>
                <label>
                  产品编码
                  <input
                    type="text"
                    value={item.productCode ?? ''}
                    onChange={(event) => updateItem(item.id, 'productCode', event.target.value)}
                  />
                </label>
                <label>
                  箱号
                  <input
                    type="text"
                    value={item.boxNo ?? ''}
                    onChange={(event) => updateItem(item.id, 'boxNo', event.target.value)}
                  />
                </label>
                <label>
                  箱数
                  <input
                    type="number"
                    min={1}
                    value={item.boxCount ?? 1}
                    onChange={(event) => updateItem(item.id, 'boxCount', Number(event.target.value))}
                  />
                </label>
                <label>
                  单箱重量(kg)
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    value={item.singleWeightKg ?? 1}
                    onChange={(event) =>
                      updateItem(item.id, 'singleWeightKg', Number(event.target.value))
                    }
                  />
                </label>
                <label>
                  供应商归属
                  <select
                    value={item.supplierFlag ?? 'self'}
                    onChange={(event) =>
                      updateItem(item.id, 'supplierFlag', event.target.value as SupplierFlag)
                    }
                  >
                    <option value="self">己方</option>
                    <option value="other">第三方</option>
                  </select>
                </label>
              </div>

              <div className="dimensions-grid">
                <label>
                  {item.dimensionInputMode === 'outer_box' ? '外箱长(cm)' : '产品长(cm)'}
                  <input
                    type="number"
                    value={item.lengthCm}
                    onChange={(event) =>
                      updateItem(item.id, 'lengthCm', Number(event.target.value))
                    }
                  />
                </label>
                <label>
                  {item.dimensionInputMode === 'outer_box' ? '外箱宽(cm)' : '产品宽(cm)'}
                  <input
                    type="number"
                    value={item.widthCm}
                    onChange={(event) =>
                      updateItem(item.id, 'widthCm', Number(event.target.value))
                    }
                  />
                </label>
                <label>
                  {item.dimensionInputMode === 'outer_box' ? '外箱高(cm)' : '产品高(cm)'}
                  <input
                    type="number"
                    value={item.heightCm}
                    onChange={(event) =>
                      updateItem(item.id, 'heightCm', Number(event.target.value))
                    }
                  />
                </label>
                <label>
                  数量
                  <input
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(event) =>
                      updateItem(item.id, 'quantity', Number(event.target.value))
                    }
                  />
                </label>
              </div>

              <div className="packaging-summary-strip">
                <div>
                  <span>裸货尺寸</span>
                  <strong>
                    {resolved.input.lengthCm}×{resolved.input.widthCm}×{resolved.input.heightCm}cm
                  </strong>
                </div>
                <div>
                  <span>当前外尺寸</span>
                  <strong>
                    {resolved.packed.lengthCm}×{resolved.packed.widthCm}×{resolved.packed.heightCm}cm
                  </strong>
                </div>
                <div>
                  <span>单件 CBM</span>
                  <strong>{singlePackedCbm.toFixed(3)}</strong>
                </div>
              </div>

              <div className="packaging-row">
                {(['outer_box', 'estimate'] as DimensionInputMode[]).map((type) => (
                  <button
                    key={type}
                    className={item.dimensionInputMode === type ? 'chip active' : 'chip'}
                    onClick={() => updateItem(item.id, 'dimensionInputMode', type)}
                    type="button"
                  >
                    {type === 'outer_box' ? '直接填写外箱尺寸' : '按产品尺寸估算包装'}
                  </button>
                ))}
              </div>

              <div className="dimensions-grid dimensions-grid-two">
                <label className="checkbox-card">
                  <input
                    checked={item.fragile}
                    onChange={(event) => updateItem(item.id, 'fragile', event.target.checked)}
                    type="checkbox"
                  />
                  <span>易碎产品</span>
                </label>
                {item.dimensionInputMode === 'outer_box' ? (
                  <div className="checkbox-card checkbox-card-readonly">
                    <span>纸皮箱/外箱已录入</span>
                  </div>
                ) : (
                  <label className="checkbox-card">
                    <input
                      checked={item.cartonEnabled}
                      onChange={(event) =>
                        updateItem(item.id, 'cartonEnabled', event.target.checked)
                      }
                      type="checkbox"
                    />
                    <span>纸皮箱</span>
                  </label>
                )}
              </div>

              <div className="packaging-row">
                {(['none', 'wood_frame', 'wood_crate'] as PackagingType[]).map((type) => (
                  <button
                    key={type}
                    className={item.packagingType === type ? 'chip active' : 'chip'}
                    onClick={() => updateItem(item.id, 'packagingType', type)}
                    type="button"
                  >
                    {packagingLabel(type)}
                  </button>
                ))}
                <button
                  className="ghost-button"
                  onClick={() => applyPackagingDefaults(item.id)}
                  type="button"
                >
                  套用默认厚度
                </button>
              </div>

              <div className="dimensions-grid dimensions-grid-two">
                <label>
                  木箱/木架厚度(cm)
                  <input
                    disabled={item.packagingType === 'none'}
                    min={0}
                    step="0.1"
                    type="number"
                    value={
                      item.woodThicknessCm ??
                      (item.packagingType === 'wood_crate'
                        ? 3
                        : item.packagingType === 'wood_frame'
                          ? 2
                          : 0)
                    }
                    onChange={(event) =>
                      updateItem(item.id, 'woodThicknessCm', Number(event.target.value))
                    }
                  />
                </label>
                {item.dimensionInputMode === 'estimate' ? (
                  <label>
                    纸箱厚度(cm)
                    <input
                      disabled={!item.cartonEnabled}
                      min={0}
                      step="0.1"
                      type="number"
                      value={item.cartonThicknessCm}
                      onChange={(event) =>
                        updateItem(item.id, 'cartonThicknessCm', Number(event.target.value))
                      }
                    />
                  </label>
                ) : (
                  <label>
                    外箱说明
                    <input readOnly type="text" value="当前输入已视为纸皮箱/外箱尺寸" />
                  </label>
                )}
                {item.dimensionInputMode === 'estimate' ? (
                  <>
                    <label className="checkbox-card">
                      <input
                        checked={item.foamEnabled}
                        onChange={(event) =>
                          updateItem(item.id, 'foamEnabled', event.target.checked)
                        }
                        type="checkbox"
                      />
                      <span>包泡沫</span>
                    </label>
                    <label>
                      泡沫厚度(cm)
                      <input
                        disabled={!item.foamEnabled}
                        min={0}
                        step="0.1"
                        type="number"
                        value={item.foamThicknessCm}
                        onChange={(event) =>
                          updateItem(item.id, 'foamThicknessCm', Number(event.target.value))
                        }
                      />
                    </label>
                  </>
                ) : null}
              </div>

                </>
              ) : (
                <p className="hint cargo-collapsed-hint">
                  已收起详细参数。点击“展开明细”可编辑 PI、编码、箱号、包装方式和厚度。
                </p>
              )}
                  </>
                )
              })()}
              </article>
            ))}
          </div>
        </div>

        <div className="action-bar">
          <button
            className="primary-button"
            disabled={isPlanningLoading || isQwenLoading}
            onClick={handleCalculate}
            type="button"
          >
            {isPlanningLoading ? '本地方案计算中...' : isQwenLoading ? 'Qwen 分析中...' : '生成双方案'}
          </button>
        </div>

        {isPlanningLoading ? (
          <p className="hint">正在计算本地装柜方案，大装箱单可能需要几秒，请勿关闭页面。</p>
        ) : null}
        {!isPlanningLoading && isQwenLoading ? (
          <p className="hint">本地方案已完成，正在请求 Ollama/Qwen 选择候选方案。</p>
        ) : null}

        <div className="metrics-strip">
          <div>
            <span>输入体积</span>
            <strong>{totalBareCbm.toFixed(2)} CBM</strong>
          </div>
          <div>
            <span>货物种类</span>
            <strong>{items.length}</strong>
          </div>
          <div>
            <span>总件数</span>
            <strong>{items.reduce((sum, item) => sum + item.quantity, 0)}</strong>
          </div>
        </div>

        <div className="field-group">
          <div className="section-title">
            <h2>推荐打包顺序</h2>
          </div>
          <div className="packing-sequence-list">
            {packingSequence.length === 0 ? (
              <p className="hint">点击“生成双方案”后，这里会生成推荐打包顺序。</p>
            ) : (
              packingSequence.map((step, index) => (
                <div className="packing-sequence-row" key={step.sequenceId}>
                  <strong>{index + 1}</strong>
                  <span>
                    {step.label}
                    <small>
                      {formatPlacementMeta(step)}
                    </small>
                    <small>
                      {formatBoxSummary(step)}
                    </small>
                    <small>
                      {step.packed.lengthCm}×{step.packed.widthCm}×{step.packed.heightCm}cm
                    </small>
                  </span>
                  <em>{step.note}</em>
                </div>
              ))
            )}
          </div>
          <p className="hint">
            打包顺序会优先处理木箱/木架等定制包装，再到纸箱与泡沫，易碎件默认后移，第三方货物会单独标注，方便后续拼柜。
          </p>
        </div>

        <div className="field-group qwen-settings-group">
          <div className="section-title">
            <div>
              <h2>Qwen 方案设置</h2>
              <p className="hint qwen-settings-hint">
                这块一般不用经常改，放在底部作为高级设置。如误改，可直接恢复默认。
              </p>
            </div>
            <button className="ghost-button" onClick={restoreQwenDefaults} type="button">
              恢复默认
            </button>
          </div>
          <div className="dimensions-grid dimensions-grid-two">
            <label>
              Ollama 地址
              <input
                type="text"
                value={ollamaBaseUrl}
                onChange={(event) => setOllamaBaseUrl(event.target.value)}
              />
            </label>
            <label>
              模型名
              <input
                type="text"
                value={qwenModel}
                onChange={(event) => setQwenModel(event.target.value)}
              />
            </label>
          </div>
          <p className="hint">
            默认走本机 Ollama：{DEFAULT_OLLAMA_BASE_URL}/api/generate。默认模型是 {DEFAULT_QWEN_MODEL}。Qwen 只负责从候选装柜方案里做比较和选择，最终坐标仍由本地装箱引擎生成。
          </p>
        </div>
      </section>

      <section className="panel panel-right panel-right-compare">
        <div className="visual-header">
          <div>
            <p className="eyebrow">Comparison Output</p>
            <h2>算法多柜方案 vs Qwen 多柜方案</h2>
          </div>
        </div>

        <div className="compare-grid">
          <MultiPlanWorkspace
            emptyMessage={
              isPlanningLoading
                ? '正在计算本地装箱算法方案，请稍候...'
                : '点击“生成双方案”后，这里会展示本地装箱算法的 3D 动画和 GIF 导出。'
            }
            exportPrefix={planReference}
            loadPriority={loadPriority}
            plan={algorithmPlan}
            title="本地算法方案"
            subtitle="规则计算 + 多策略搜索"
          />

          <MultiPlanWorkspace
            emptyMessage={
              isQwenLoading
                ? `正在请求 ${qwenModel} 逐柜选择更合理的装柜候选...`
                : qwenError ?? 'Qwen 方案会在调用本地 Ollama 成功后显示在这里。'
            }
            batchExplanations={qwenPlan?.batchExplanations}
            exportPrefix={planReference}
            loadPriority={loadPriority}
            modelLabel={qwenPlan?.model}
            plan={qwenPlan?.plan ?? null}
            title="Qwen 对比方案"
            subtitle={qwenPlan ? `来自 ${qwenPlan.model}` : 'Ollama / Qwen'}
          />
        </div>
      </section>
    </main>
  )
}

function getRemainingSpaceFromPlan(plan: MultiContainerPlan): RemainingSpaceInput | undefined {
  const matchesFullContainer =
    plan.packingSpace.originXCm === 0 &&
    plan.packingSpace.lengthCm === plan.container.lengthCm &&
    plan.packingSpace.widthCm === plan.container.widthCm &&
    plan.packingSpace.heightCm === plan.container.heightCm

  if (matchesFullContainer) {
    return undefined
  }

  return {
    enabled: true,
    lengthCm: plan.packingSpace.lengthCm,
    widthCm: plan.packingSpace.widthCm,
    heightCm: plan.packingSpace.heightCm,
  }
}

export default App

function MultiPlanWorkspace({
  title,
  subtitle,
  plan,
  batchExplanations,
  emptyMessage,
  exportPrefix,
  loadPriority,
  modelLabel,
}: {
  title: string
  subtitle: string
  plan: MultiContainerPlan | null
  batchExplanations?: Record<string, string[]>
  emptyMessage: string
  exportPrefix?: string
  loadPriority: LoadPriority
  modelLabel?: string
}) {
  const [workingPlan, setWorkingPlan] = useState<MultiContainerPlan | null>(plan)
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null)
  const [frame, setFrame] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isHtmlExporting, setIsHtmlExporting] = useState(false)
  const [selectedPlacementId, setSelectedPlacementId] = useState<string | null>(null)
  const [hasManualOverride, setHasManualOverride] = useState(false)
  const [adjustError, setAdjustError] = useState<string | null>(null)
  const [nudgeStepCm, setNudgeStepCm] = useState(10)

  const activeBatch =
    workingPlan?.batches.find((batch) => batch.batchId === selectedBatchId) ??
    workingPlan?.batches[0] ??
    null
  const activePlan = activeBatch?.plan ?? null
  const activeExplanation = activeBatch ? batchExplanations?.[activeBatch.batchId] : undefined
  const activeBoxManifest = activeBatch ? buildBoxManifest(activeBatch.units) : []

  useEffect(() => {
    setWorkingPlan(plan)
    setHasManualOverride(false)
    setAdjustError(null)
  }, [plan])

  useEffect(() => {
    setSelectedBatchId(plan?.batches[0]?.batchId ?? null)
  }, [plan])

  useEffect(() => {
    setFrame(0)
    setIsPlaying(Boolean(activePlan))
    setSelectedPlacementId(null)
    setAdjustError(null)
  }, [activePlan])

  useEffect(() => {
    if (!activePlan || !isPlaying) {
      return
    }

    if (frame >= activePlan.placements.length) {
      setIsPlaying(false)
      return
    }

    const timer = window.setTimeout(() => {
      setFrame((current) => current + 1)
    }, 380)

    return () => window.clearTimeout(timer)
  }, [activePlan, frame, isPlaying])

  const scene = activePlan ? createSceneData(activePlan) : null
  const currentPlacement =
    activePlan && frame > 0
      ? activePlan.placements[Math.min(frame, activePlan.placements.length) - 1]
      : null
  const activePlacementId =
    selectedPlacementId ??
    (currentPlacement ? `${currentPlacement.itemId}-${currentPlacement.index}` : null)
  const activePlacement =
    activePlan && activePlacementId
      ? activePlan.placements.find(
          (placement) => `${placement.itemId}-${placement.index}` === activePlacementId,
        ) ?? null
      : currentPlacement

  async function handleExport() {
    if (!activePlan || !activeBatch) {
      return
    }

    setIsExporting(true)
    try {
      const blob = await exportPlanAsGif(activePlan)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${slugify(exportPrefix || title)}-${slugify(title)}-${activeBatch.containerIndex}-${activePlan.containerType.toLowerCase()}.gif`
      link.click()
      URL.revokeObjectURL(url)
    } finally {
      setIsExporting(false)
    }
  }

  async function handleExportHtml() {
    if (!activePlan || !activeBatch) {
      return
    }

    setIsHtmlExporting(true)
    try {
      const blob = exportPlanAsStandaloneHtml({
        title: `${exportPrefix ? `${exportPrefix} · ` : ''}${title} - 第 ${activeBatch.containerIndex} 柜`,
        subtitle: `${subtitle} · ${activeBatch.strategyLabel}`,
        plan: activePlan,
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${slugify(exportPrefix || title)}-${slugify(title)}-${activeBatch.containerIndex}-${activePlan.containerType.toLowerCase()}.html`
      link.click()
      URL.revokeObjectURL(url)
    } finally {
      setIsHtmlExporting(false)
    }
  }

  function rebuildWorkingPlan(nextBatches: MultiContainerPlan['batches']) {
    if (!workingPlan) {
      return null
    }

    const containerCbm = workingPlan.summary.containerCbm
    const packedUnits = nextBatches.reduce((sum, batch) => sum + batch.plan.placements.length, 0)
    const totalPlacedPackedCbm = nextBatches.reduce(
      (sum, batch) => sum + batch.plan.summary.utilizationRatio * batch.plan.summary.containerCbm,
      0,
    )

    const inheritedUnpacked = workingPlan.unpackedItems.map((item) => ({
      itemId: item.itemId,
      label: item.label,
      index: item.index,
    }))
    const batchUnpacked = nextBatches.flatMap((batch) => batch.plan.unpackedItems)
    const unpackedMap = new Map(
      [...inheritedUnpacked, ...batchUnpacked].map((item) => [
        `${item.itemId}-${item.index}`,
        item,
      ]),
    )

    return {
      ...workingPlan,
      batches: nextBatches,
      unpackedItems: [...unpackedMap.values()],
      summary: {
        ...workingPlan.summary,
        packedUnits,
        totalContainers: nextBatches.length,
        utilizationRatio:
          nextBatches.length > 0 ? totalPlacedPackedCbm / (containerCbm * nextBatches.length) : 0,
        unpackedItems: unpackedMap.size,
      },
    } satisfies MultiContainerPlan
  }

  function movePlacement(placementId: string, direction: 'up' | 'down') {
    if (!workingPlan || !activeBatch) {
      return
    }

    const orderedUnitKeys = activeBatch.plan.placements.map(
      (placement) => `${placement.itemId}-${placement.index}`,
    )
    const index = orderedUnitKeys.indexOf(placementId)
    if (index === -1) {
      return
    }

    const nextIndex = direction === 'up' ? index - 1 : index + 1
    if (nextIndex < 0 || nextIndex >= orderedUnitKeys.length) {
      return
    }

    const nextOrderedKeys = [...orderedUnitKeys]
    ;[nextOrderedKeys[index], nextOrderedKeys[nextIndex]] = [
      nextOrderedKeys[nextIndex],
      nextOrderedKeys[index],
    ]

    const nextPlan = calculateContainerPlanWithSequenceForUnits({
      containerType: workingPlan.containerType,
      units: activeBatch.units,
      orderedUnitKeys: nextOrderedKeys,
      customContainer: workingPlan.containerType === 'CUSTOM' ? workingPlan.container : undefined,
      remainingSpace: getRemainingSpaceFromPlan(workingPlan),
      loadPriority: loadPriority,
    })

    const nextBatches = workingPlan.batches.map((batch) =>
      batch.batchId === activeBatch.batchId
        ? {
            ...batch,
            strategyLabel: `${batch.strategyLabel} · 人工调整`,
            candidateId: `${batch.candidateId}-manual`,
            plan: nextPlan,
          }
        : batch,
    )
    const nextWorkingPlan = rebuildWorkingPlan(nextBatches)
    if (!nextWorkingPlan) {
      return
    }

    setWorkingPlan(nextWorkingPlan)
    setSelectedPlacementId(nextOrderedKeys[nextIndex] ?? null)
    setFrame(Math.max(1, nextPlan.placements.length))
    setIsPlaying(false)
    setHasManualOverride(true)
    setAdjustError(null)
  }

  function nudgePlacement(axis: PlacementAxis, deltaCm: number) {
    if (!workingPlan || !activeBatch || !activePlan || !activePlacementId) {
      return
    }

    const nextPlan = nudgePlacementInPlan({
      plan: activePlan,
      placementId: activePlacementId,
      axis,
      deltaCm,
    })

    if (!nextPlan) {
      setAdjustError('该方向移动后会超出货柜、与其他货物碰撞，或失去足够支撑。')
      return
    }

    const nextBatches = workingPlan.batches.map((batch) =>
      batch.batchId === activeBatch.batchId
        ? {
            ...batch,
            strategyLabel: `${batch.strategyLabel} · 人工调整`,
            candidateId: `${batch.candidateId}-manual`,
            plan: nextPlan,
          }
        : batch,
    )
    const nextWorkingPlan = rebuildWorkingPlan(nextBatches)
    if (!nextWorkingPlan) {
      return
    }

    setWorkingPlan(nextWorkingPlan)
    setSelectedPlacementId(activePlacementId)
    setFrame(Math.max(1, nextPlan.placements.length))
    setIsPlaying(false)
    setHasManualOverride(true)
    setAdjustError(null)
  }

  function resetManualOverride() {
    setWorkingPlan(plan)
    setSelectedBatchId(plan?.batches[0]?.batchId ?? null)
    setSelectedPlacementId(null)
    setFrame(0)
    setIsPlaying(Boolean(plan?.batches[0]?.plan))
    setHasManualOverride(false)
    setAdjustError(null)
  }

  return (
    <article className="compare-card">
      <div className="compare-card-header">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        {plan ? (
          <div className="compare-card-actions">
            <button
              className="secondary-button"
              onClick={() => {
                setFrame(0)
                setIsPlaying(true)
              }}
              type="button"
            >
              重播
            </button>
            <button
              className="secondary-button"
              disabled={isExporting}
              onClick={handleExport}
              type="button"
            >
              {isExporting ? '导出中...' : '导出 GIF'}
            </button>
            <button
              className="secondary-button"
              disabled={isHtmlExporting}
              onClick={handleExportHtml}
              type="button"
            >
              {isHtmlExporting ? '导出中...' : '导出 HTML'}
            </button>
          </div>
        ) : null}
      </div>

      {workingPlan ? (
        <>
          <div className="workspace-summary">
            <div className="result-card">
              <span>使用柜数</span>
              <strong>{workingPlan.summary.totalContainers}</strong>
            </div>
            <div className="result-card">
              <span>已装入件数</span>
              <strong>
                {workingPlan.summary.packedUnits}/{workingPlan.summary.totalUnits}
              </strong>
            </div>
            <div className="result-card">
              <span>平均利用率</span>
              <strong>{(workingPlan.summary.utilizationRatio * 100).toFixed(1)}%</strong>
            </div>
            <div className="result-card">
              <span>未装入件数</span>
              <strong>{workingPlan.summary.unpackedItems}</strong>
            </div>
          </div>

          {workingPlan.batches.length > 0 ? (
            <div className="batch-tab-row">
              {workingPlan.batches.map((batch) => (
                <button
                  key={batch.batchId}
                  className={batch.batchId === activeBatch?.batchId ? 'batch-tab active' : 'batch-tab'}
                  onClick={() => {
                    setSelectedBatchId(batch.batchId)
                    setSelectedPlacementId(null)
                    setFrame(0)
                    setIsPlaying(true)
                  }}
                  type="button"
                >
                  第 {batch.containerIndex} 柜
                  <small>
                    {batch.strategyLabel}
                    {modelLabel ? ` · ${modelLabel}` : ''}
                  </small>
                </button>
              ))}
            </div>
          ) : null}

          {activePlan ? (
            <>
              <div className="visual-stage visual-stage-compare">
                <ScenePreview
                  activePlacementId={activePlacementId}
                  onSelectPlacement={setSelectedPlacementId}
                  plan={activePlan}
                  visibleCount={frame || 0}
                />
              </div>

              <div className="results-grid results-grid-compare">
                <div className="result-card">
                  <span>当前柜结果</span>
                  <strong>{activePlan.fits ? '可装入' : '超出容量'}</strong>
                </div>
                <div className="result-card">
                  <span>当前柜利用率</span>
                  <strong>{(activePlan.summary.utilizationRatio * 100).toFixed(1)}%</strong>
                </div>
                <div className="result-card">
                  <span>当前柜装入件数</span>
                  <strong>{activePlan.placements.length}</strong>
                </div>
                <div className="result-card">
                  <span>当前柜未装入</span>
                  <strong>{activePlan.summary.unpackedItems}</strong>
                </div>
              </div>

              {activeExplanation?.length ? (
                <div className="explanation-card">
                  <h4>Qwen 当前柜判断依据</h4>
                  <ul>
                    {activeExplanation.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

                <div className="sequence-card">
                  <div className="sequence-header">
                    <h3>当前柜装柜顺序</h3>
                    <div className="sequence-toolbar">
                      <span>{activePlan.placements.length} 步</span>
                      {activePlacementId ? (
                        <>
                          <button
                            className="ghost-button"
                            disabled={activePlan.placements.findIndex(
                              (placement) => `${placement.itemId}-${placement.index}` === activePlacementId,
                            ) <= 0}
                            onClick={() => movePlacement(activePlacementId, 'up')}
                            type="button"
                          >
                            上移
                          </button>
                          <button
                            className="ghost-button"
                            disabled={
                              activePlan.placements.findIndex(
                                (placement) => `${placement.itemId}-${placement.index}` === activePlacementId,
                              ) ===
                              activePlan.placements.length - 1
                            }
                            onClick={() => movePlacement(activePlacementId, 'down')}
                            type="button"
                          >
                            下移
                          </button>
                        </>
                      ) : null}
                      {hasManualOverride ? (
                        <button
                          className="ghost-button"
                          onClick={resetManualOverride}
                          type="button"
                        >
                          恢复系统结果
                        </button>
                      ) : null}
                    </div>
                  </div>
                {scene ? (
                  <div className="container-dimension-banner">
                    <strong>{scene.container.label}</strong>
                    <span>{scene.container.dimensionLabel}</span>
                  </div>
                ) : null}
                {activeBatch ? (
                  <div className="workspace-note">
                    <span>本柜策略</span>
                    <strong>
                      第 {activeBatch.containerIndex} 柜 · {activeBatch.strategyLabel}
                    </strong>
                  </div>
                ) : null}
                {exportPrefix ? (
                  <div className="workspace-note">
                    <span>订单/方案编号</span>
                    <strong>{exportPrefix}</strong>
                  </div>
                ) : null}
                {hasManualOverride ? (
                  <div className="workspace-note workspace-note-warning">
                    <span>人工调整</span>
                    <strong>当前柜顺序已人工修改，右侧动画与 GIF 将按人工顺序重新生成。</strong>
                  </div>
                ) : null}
                {activePlacement ? (
                  <div className="focus-card">
                    <div>
                      <span>{selectedPlacementId ? '当前选中货物' : '当前动画聚焦'}</span>
                      <strong>{activePlacement.label}</strong>
                      <small>
                        {formatPlacementMeta(activePlacement)}
                      </small>
                    </div>
                    <div>
                      <span>外尺寸</span>
                      <strong>
                        {activePlacement.lengthCm}×{activePlacement.widthCm}×{activePlacement.heightCm}cm
                      </strong>
                      <small>{formatBoxSummary(activePlacement)}</small>
                    </div>
                    <div>
                      <span>装入坐标</span>
                      <strong>
                        x:{activePlacement.xCm} / y:{activePlacement.yCm} / z:{activePlacement.zCm}
                      </strong>
                      <small>{activePlacement.productCode ? `产品编码 ${activePlacement.productCode}` : '未填写产品编码'}</small>
                    </div>
                  </div>
                ) : null}
                {activeBoxManifest.length > 0 ? (
                  <div className="box-manifest-card">
                    <div className="sequence-header">
                      <h3>当前柜箱号明细</h3>
                      <span>{activeBoxManifest.length} 个箱号</span>
                    </div>
                    <div className="box-manifest-list">
                      {activeBoxManifest.map((group) => (
                        <div className="box-manifest-group" key={group.boxKey}>
                          <div className="box-manifest-header">
                            <strong>{group.displayBoxNo}</strong>
                            <small>
                              {group.entries.length} 种产品 · 箱内合计 {group.totalQuantityInBox} 件
                            </small>
                          </div>
                          <div className="box-manifest-items">
                            {group.entries.map((entry) => (
                              <div className="box-manifest-item" key={entry.entryKey}>
                                <strong>{entry.label}</strong>
                                <small>
                                  {entry.piNo ? `PI ${entry.piNo}` : '未填PI'}
                                  {' · '}
                                  {entry.productCode ? `产品编码 ${entry.productCode}` : '未填编码'}
                                </small>
                                <small>
                                  箱内数量 {entry.quantityInBox} 件
                                  {entry.supplierFlag === 'other' ? ' · 第三方' : ' · 己方'}
                                </small>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {activePlacement ? (
                  <div className="position-adjust-card">
                    <div className="position-adjust-header">
                      <div>
                        <span>货物微调</span>
                        <strong>按 {nudgeStepCm}cm 步长微调当前货物位置</strong>
                      </div>
                      <div className="nudge-step-group">
                        {[1, 5, 10, 20].map((step) => (
                          <button
                            key={step}
                            className={nudgeStepCm === step ? 'chip active' : 'chip'}
                            onClick={() => setNudgeStepCm(step)}
                            type="button"
                          >
                            {step}cm
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="position-adjust-grid">
                      <button className="ghost-button" onClick={() => nudgePlacement('xCm', -nudgeStepCm)} type="button">
                        向柜门
                      </button>
                      <button className="ghost-button" onClick={() => nudgePlacement('xCm', nudgeStepCm)} type="button">
                        向柜内
                      </button>
                      <button className="ghost-button" onClick={() => nudgePlacement('yCm', -nudgeStepCm)} type="button">
                        向左
                      </button>
                      <button className="ghost-button" onClick={() => nudgePlacement('yCm', nudgeStepCm)} type="button">
                        向右
                      </button>
                      <button className="ghost-button" onClick={() => nudgePlacement('zCm', -nudgeStepCm)} type="button">
                        下移
                      </button>
                      <button className="ghost-button" onClick={() => nudgePlacement('zCm', nudgeStepCm)} type="button">
                        上移
                      </button>
                    </div>
                    <p className="hint">
                      x 为柜长方向，y 为柜宽方向，z 为高度方向。微调后系统会自动检查碰撞、支撑和易碎约束。
                    </p>
                    {adjustError ? <p className="inline-error">{adjustError}</p> : null}
                  </div>
                ) : null}
                <div className="sequence-list">
                  {activePlan.placements.map((placement, index) => {
                    const placementId = `${placement.itemId}-${placement.index}`
                    return (
                      <button
                        className={
                          placementId === activePlacementId
                            ? 'sequence-row active'
                            : 'sequence-row'
                        }
                        key={placementId}
                        onClick={() => {
                          setSelectedPlacementId(placementId)
                          setFrame(Math.max(frame, index + 1))
                          setIsPlaying(false)
                        }}
                        type="button"
                      >
                        <strong>{index + 1}</strong>
                        <span>
                          {placement.label}
                          <small>
                            {formatPlacementMeta(placement)}
                          </small>
                          <small>
                            {placement.lengthCm}×{placement.widthCm}×{placement.heightCm}cm
                          </small>
                          <small>
                            {formatBoxSummary(placement)}
                          </small>
                        </span>
                        <em>
                          x:{placement.xCm} / y:{placement.yCm} / z:{placement.zCm}
                        </em>
                      </button>
                    )
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="empty-state">
              <p>当前没有可展示的柜内装载结果。</p>
            </div>
          )}

          {workingPlan.unpackedItems.length > 0 ? (
            <div className="explanation-card">
              <h4>仍未装入的货物</h4>
              <ul>
                {workingPlan.unpackedItems.map((item) => (
                  <li key={`${item.itemId}-${item.index}`}>
                    {item.label} #{item.index + 1}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : (
        <div className="empty-state">
          <p>{emptyMessage}</p>
        </div>
      )}
    </article>
  )
}

function packagingLabel(type: PackagingType) {
  switch (type) {
    case 'wood_frame':
      return '木架'
    case 'wood_crate':
      return '木箱'
    default:
      return '裸货'
  }
}

type BoxManifestEntry = {
  entryKey: string
  label: string
  piNo: string
  productCode: string
  quantityInBox: number
  supplierFlag: SupplierFlag
}

type BoxManifestGroup = {
  boxKey: string
  displayBoxNo: string
  totalQuantityInBox: number
  entries: BoxManifestEntry[]
}

function buildBoxManifest(units: MultiContainerPlan['batches'][number]['units']): BoxManifestGroup[] {
  const grouped = new Map<string, BoxManifestGroup>()

  for (const unit of units) {
    const normalizedBoxNo = unit.boxNo.trim()
    const boxKey = normalizedBoxNo || `${unit.piNo || 'PI-UNKNOWN'}-${unit.productCode || unit.itemId}`
    const displayBoxNo = normalizedBoxNo || '未填写箱号'

    if (!grouped.has(boxKey)) {
      grouped.set(boxKey, {
        boxKey,
        displayBoxNo,
        totalQuantityInBox: 0,
        entries: [],
      })
    }

    const group = grouped.get(boxKey)!
    const contents = getPlacementContents(unit)
    group.totalQuantityInBox += contents.reduce((sum, entry) => sum + entry.declaredQuantity, 0)

    for (const content of contents) {
      const entryKey = `${content.piNo || 'NO-PI'}-${content.productCode || 'NO-CODE'}-${content.label}`
      const existing = group.entries.find((entry) => entry.entryKey === entryKey)
      if (existing) {
        existing.quantityInBox += content.declaredQuantity
        continue
      }

      group.entries.push({
        entryKey,
        label: content.label,
        piNo: content.piNo,
        productCode: content.productCode,
        quantityInBox: content.declaredQuantity,
        supplierFlag: content.supplierFlag,
      })
    }
  }

  return [...grouped.values()]
}

function getPlacementContents(placement: {
  label?: string
  piNo?: string
  productCode?: string
  boxNo?: string
  declaredQuantity?: number
  supplierFlag?: SupplierFlag
  contents?: BoxContentEntry[]
}) {
  if (placement.contents && placement.contents.length > 0) {
    return placement.contents
  }

  return [
    {
      entryId: `${placement.productCode || placement.piNo || placement.label || 'ITEM'}-${placement.boxNo || 'BOX'}`,
      label: placement.label || '未命名货物',
      piNo: placement.piNo || '',
      productCode: placement.productCode || '',
      declaredQuantity: placement.declaredQuantity ?? 0,
      supplierFlag: placement.supplierFlag ?? 'self',
      fragile: false,
    },
  ]
}

function getPlacementTotalQuantity(placement: {
  label?: string
  piNo?: string
  productCode?: string
  boxNo?: string
  declaredQuantity?: number
  supplierFlag?: SupplierFlag
  contents?: BoxContentEntry[]
}) {
  return getPlacementContents(placement).reduce((sum, entry) => sum + entry.declaredQuantity, 0)
}

function formatBoxSummary(placement: {
  label?: string
  piNo?: string
  productCode?: string
  boxNo?: string
  declaredQuantity?: number
  supplierFlag?: SupplierFlag
  contents?: BoxContentEntry[]
}) {
  const contents = getPlacementContents(placement)
  return `箱内合计 ${getPlacementTotalQuantity(placement)} 件 · ${contents.length} 种产品`
}

function formatPlacementMeta(placement: {
  label?: string
  piNo?: string
  productCode?: string
  boxNo?: string
  declaredQuantity?: number
  supplierFlag?: SupplierFlag
  contents?: BoxContentEntry[]
}) {
  const boxNo = placement.boxNo?.trim()
  const contents = getPlacementContents(placement)

  if (contents.length > 1) {
    return [boxNo ? `箱号 ${boxNo}` : '未填写箱号', '混装箱'].join(' · ')
  }

  const content = contents[0]
  const parts = [
    content.piNo ? `PI ${content.piNo}` : '',
    content.productCode ? `产品编码 ${content.productCode}` : '',
    boxNo ? `箱号 ${boxNo}` : '',
  ].filter(Boolean)

  return parts.join(' · ') || '未填写 PI / 产品编码 / 箱号'
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\u4e00-\u9fa5-]+/g, '')
}

function createDefaultItem(label: string): ItemInput {
  return {
    id: crypto.randomUUID(),
    label,
    piNo: '',
    productCode: '',
    boxNo: '',
    boxCount: 1,
    singleWeightKg: 1,
    orderId: '',
    supplierFlag: 'self',
    lengthCm: 100,
    widthCm: 80,
    heightCm: 80,
    quantity: 1,
    packagingType: 'none',
    dimensionInputMode: 'estimate',
    fragile: false,
    cartonEnabled: false,
    cartonThicknessCm: 0.5,
    foamEnabled: false,
    foamThicknessCm: 2,
    woodThicknessCm: 3,
  }
}
