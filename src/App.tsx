import { useEffect, useMemo, useState } from 'react'
import './App.css'
import {
  calculateMultiContainerPlan,
  calculateContainerPlanWithSequenceForUnits,
  calculateItemCbm,
  generatePackingSequence,
  getContainerDimensions,
  getContainerLabel,
  nudgePlacementInPlan,
  recommendContainerPlans,
  resolveItemDimensions,
  type ContainerType,
  type Dimension3D,
  type DimensionInputMode,
  type ItemInput,
  type MultiContainerPlan,
  type PackagingType,
  type PlacementAxis,
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

function App() {
  const [containerType, setContainerType] = useState<ContainerType>('40HQ')
  const [splitMode, setSplitMode] = useState<SplitMode>('mixed')
  const [planReference, setPlanReference] = useState('')
  const [customContainer, setCustomContainer] = useState<Dimension3D>({
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
  const [algorithmPlan, setAlgorithmPlan] = useState<MultiContainerPlan | null>(null)
  const [qwenPlan, setQwenPlan] = useState<OllamaMultiContainerPlan | null>(null)
  const [qwenModel, setQwenModel] = useState('qwen3:8b')
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState('http://127.0.0.1:11434')
  const [isQwenLoading, setIsQwenLoading] = useState(false)
  const [qwenError, setQwenError] = useState<string | null>(null)
  const [importMessage, setImportMessage] = useState<string | null>(null)

  const resolvedCustomContainer = containerType === 'CUSTOM' ? customContainer : undefined
  const container = getContainerDimensions(containerType, resolvedCustomContainer)
  const recommendedContainers = useMemo(
    () => recommendContainerPlans({ items, splitMode }).slice(0, 3),
    [items, splitMode],
  )
  const packingSequence = useMemo(() => generatePackingSequence(items), [items])
  const totalBareCbm = items.reduce(
    (sum, item) =>
      sum +
      calculateItemCbm({
        lengthCm: item.lengthCm,
        widthCm: item.widthCm,
        heightCm: item.heightCm,
        quantity: item.quantity,
      }),
    0,
  )

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(
      CUSTOM_CONTAINER_PRESET_STORAGE_KEY,
      JSON.stringify(customContainerPresets),
    )
  }, [customContainerPresets])

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
    setItems((current) => [
      ...current,
      createDefaultItem(`货物 ${current.length + 1}`),
    ])
  }

  function removeItem(itemId: string) {
    setItems((current) => current.filter((item) => item.id !== itemId))
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
    const nextAlgorithmPlan = calculateMultiContainerPlan({
      containerType,
      items,
      customContainer: resolvedCustomContainer,
      splitMode,
    })
    setAlgorithmPlan(nextAlgorithmPlan)
    setQwenPlan(null)
    setQwenError(null)
    setIsQwenLoading(true)

    try {
      const nextQwenPlan = await requestOllamaMultiContainerPlan({
        containerType,
        items,
        model: qwenModel,
        baseUrl: ollamaBaseUrl,
        customContainer: resolvedCustomContainer,
        splitMode,
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
      setPlanReference(file.name.replace(/\.[^.]+$/, ''))
      setImportMessage(`已导入 ${importedItems.length} 条货物，默认按外箱尺寸计算。`)
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : '装箱单导入失败')
    }
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
          <div className="recommendation-list">
            {recommendedContainers.map((recommendation, index) => (
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
            ))}
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
        </div>

        <div className="field-group">
          <div className="section-title">
            <h2>Qwen 方案</h2>
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
            默认走本机 Ollama：{ollamaBaseUrl}/api/generate。Qwen 从多套候选装柜方案里选出它认为更合理的一套，最终坐标仍由本地装箱引擎生成。
          </p>
        </div>

        <div className="items-panel">
          <div className="section-title">
            <h2>货物清单</h2>
            <button className="secondary-button" onClick={addItem} type="button">
              新增货物
            </button>
          </div>

          {items.map((item, index) => (
            <article className="cargo-card" key={item.id}>
              {(() => {
                const resolved = resolveItemDimensions(item)
                const singlePackedCbm = calculateItemCbm(resolved.packed)

                return (
                  <>
              <div className="cargo-card-header">
                <input
                  className="cargo-name"
                  value={item.label}
                  onChange={(event) => updateItem(item.id, 'label', event.target.value)}
                />
                {items.length > 1 ? (
                  <div className="cargo-card-actions">
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
                  </div>
                ) : (
                  <span className="cargo-index">#{index + 1}</span>
                )}
              </div>

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
                <label className="checkbox-card">
                  <input
                    checked={item.cartonEnabled}
                    disabled={item.dimensionInputMode === 'outer_box'}
                    onChange={(event) =>
                      updateItem(item.id, 'cartonEnabled', event.target.checked)
                    }
                    type="checkbox"
                  />
                  <span>定制纸箱</span>
                </label>
              </div>

              {item.dimensionInputMode === 'estimate' ? (
                <>
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
                        value={item.woodThicknessCm ?? (item.packagingType === 'wood_crate' ? 3 : item.packagingType === 'wood_frame' ? 2 : 0)}
                        onChange={(event) =>
                          updateItem(item.id, 'woodThicknessCm', Number(event.target.value))
                        }
                      />
                    </label>
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
                  </div>
                </>
              ) : (
                <p className="hint">
                  当前按外箱尺寸直接计算，不再额外估算纸箱、泡沫或木架外扩。
                </p>
              )}

              <p className="hint">
                装箱单映射建议：常规货物直接填外箱尺寸；定制产品勾选纸皮/木箱/木架并填写厚度；易碎品可勾选包泡沫；第三方供应商货物会按拼柜逻辑靠外侧排。
              </p>
                  </>
                )
              })()}
            </article>
          ))}
        </div>

        <div className="action-bar">
          <button className="primary-button" onClick={handleCalculate} type="button">
            生成双方案
          </button>
        </div>

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
            {packingSequence.map((step, index) => (
              <div className="packing-sequence-row" key={step.sequenceId}>
                <strong>{index + 1}</strong>
                <span>
                  {step.label}
                  <small>
                    {step.packed.lengthCm}×{step.packed.widthCm}×{step.packed.heightCm}cm
                  </small>
                </span>
                <em>{step.note}</em>
              </div>
            ))}
          </div>
          <p className="hint">
            打包顺序会优先处理木箱/木架等定制包装，再到纸箱与泡沫，易碎件默认后移，第三方货物会单独标注，方便后续拼柜。
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
            emptyMessage="点击“生成双方案”后，这里会展示本地装箱算法的 3D 动画和 GIF 导出。"
            exportPrefix={planReference}
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

export default App

function MultiPlanWorkspace({
  title,
  subtitle,
  plan,
  batchExplanations,
  emptyMessage,
  exportPrefix,
  modelLabel,
}: {
  title: string
  subtitle: string
  plan: MultiContainerPlan | null
  batchExplanations?: Record<string, string[]>
  emptyMessage: string
  exportPrefix?: string
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
                        {activePlacement.piNo ? `PI ${activePlacement.piNo}` : ''}
                        {activePlacement.piNo && activePlacement.boxNo ? ' · ' : ''}
                        {activePlacement.boxNo ? `箱号 ${activePlacement.boxNo}` : ''}
                      </small>
                    </div>
                    <div>
                      <span>外尺寸</span>
                      <strong>
                        {activePlacement.lengthCm}×{activePlacement.widthCm}×{activePlacement.heightCm}cm
                      </strong>
                    </div>
                    <div>
                      <span>装入坐标</span>
                      <strong>
                        x:{activePlacement.xCm} / y:{activePlacement.yCm} / z:{activePlacement.zCm}
                      </strong>
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
                            {placement.piNo ? `PI ${placement.piNo}` : ''}
                            {placement.piNo && placement.boxNo ? ' · ' : ''}
                            {placement.boxNo ? `箱号 ${placement.boxNo}` : ''}
                          </small>
                          <small>
                            {placement.lengthCm}×{placement.widthCm}×{placement.heightCm}cm
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
