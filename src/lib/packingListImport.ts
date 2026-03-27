import * as XLSX from 'xlsx'
import type { ItemInput } from './containerPlanner'

type RowRecord = Record<string, unknown>

const HEADER_ALIASES: Record<string, string> = {
  品名: 'product_name',
  编码: 'product_code',
  PI序列号: 'pi_no',
  备注: 'remark',
  备注说明: 'remark',
  供应商备注: 'remark',
  数量: 'quantity',
  箱数: 'box_count',
  装箱数: 'load_qty',
  箱号: 'box_no',
  长: 'length_cm',
  宽: 'width_cm',
  高: 'height_cm',
  重量: 'single_weight',
  总重量: 'total_weight',
}

export async function importPackingListFile(file: File): Promise<ItemInput[]> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined

  if (!sheetName || !sheet) {
    throw new Error('装箱单里没有可读取的工作表')
  }

  const rows = sheetToRowsWithFilledMerges(sheet)

  return parsePackingListRows(rows)
}

export function parsePackingListRows(rows: Array<Array<string | number | null>>): ItemInput[] {
  const headerIndex = rows.findIndex((row) => row.some((cell) => normalizeText(cell) === '品名'))
  if (headerIndex === -1) {
    throw new Error('未找到装箱单表头，请确认包含“品名 / 长 / 宽 / 高 / 数量”等列')
  }

  const headers = rows[headerIndex].map((cell) => normalizeText(cell))
  const records = rows
    .slice(headerIndex + 1)
    .map((row) => toRecord(headers, row))
    .filter((record) => Object.values(record).some((value) => String(value ?? '').trim() !== ''))

  const items: ItemInput[] = []
  let pending: RowRecord | null = null

  for (const record of records) {
    const normalized = normalizeRecord(record)
    const hasDimensions =
      Number(normalized.length_cm) > 0 &&
      Number(normalized.width_cm) > 0 &&
      Number(normalized.height_cm) > 0
    const hasIdentity = Boolean(normalized.product_name || normalized.product_code || normalized.pi_no)

    if (hasIdentity && !hasDimensions) {
      pending = mergeRowRecords(pending, normalized)
      continue
    }

    const merged = mergeRowRecords(pending, normalized)
    pending = null

    if (!merged.product_name || !hasPositiveNumber(merged.length_cm) || !hasPositiveNumber(merged.width_cm) || !hasPositiveNumber(merged.height_cm)) {
      continue
    }

    const quantity = toNumber(merged.load_qty) || toNumber(merged.quantity) || 1
    const boxCount = toNumber(merged.box_count) || 1
    const totalWeight = toNumber(merged.total_weight)
    const singleWeight =
      toNumber(merged.single_weight) || (totalWeight > 0 && boxCount > 0 ? totalWeight / boxCount : 1)
    const expandedBoxNumbers = expandImportedBoxNumbers(
      String(merged.box_no || ''),
      boxCount,
      String(merged.product_code || merged.product_name || `BOX-${items.length + 1}`),
    )
    const distributedQuantities = distributeDeclaredQuantities(quantity, expandedBoxNumbers.length)

    for (let index = 0; index < expandedBoxNumbers.length; index += 1) {
      items.push({
        id: createStableId(
          `${String(merged.product_code || merged.product_name)}-${expandedBoxNumbers[index]}`,
          items.length,
        ),
        label: String(merged.product_name),
        piNo: String(merged.pi_no || ''),
        productCode: String(merged.product_code || ''),
        boxNo: expandedBoxNumbers[index],
        boxCount: 1,
        singleWeightKg: round(singleWeight, 2),
        orderId: '',
        supplierFlag: resolveSupplierFlag(merged.remark),
        lengthCm: toNumber(merged.length_cm),
        widthCm: toNumber(merged.width_cm),
        heightCm: toNumber(merged.height_cm),
        quantity: distributedQuantities[index] || 1,
        packagingType: 'none',
        dimensionInputMode: 'outer_box',
        fragile: false,
        cartonEnabled: false,
        cartonThicknessCm: 0.5,
        foamEnabled: false,
        foamThicknessCm: 2,
        woodThicknessCm: 3,
      })
    }
  }

  if (!items.length) {
    throw new Error('没有从装箱单中解析到有效货物，请确认长宽高与数量列都存在')
  }

  return items
}

function normalizeRecord(record: RowRecord): RowRecord {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [HEADER_ALIASES[key] ?? key, value]),
  )
}

function mergeRowRecords(base: RowRecord | null, next: RowRecord): RowRecord {
  const merged: RowRecord = { ...(base ?? {}) }

  for (const [key, value] of Object.entries(next)) {
    if (String(value ?? '').trim() === '') {
      continue
    }
    merged[key] = value
  }

  return merged
}

function toRecord(headers: string[], row: Array<string | number | null>) {
  return headers.reduce<RowRecord>((record, header, index) => {
    if (!header) {
      return record
    }
    record[header] = row[index]
    return record
  }, {})
}

function sheetToRowsWithFilledMerges(sheet: XLSX.WorkSheet) {
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    raw: false,
    defval: '',
  })
  const merges = sheet['!merges'] ?? []

  for (const merge of merges) {
    const topLeftValue = rows[merge.s.r]?.[merge.s.c] ?? ''
    for (let rowIndex = merge.s.r; rowIndex <= merge.e.r; rowIndex += 1) {
      if (!rows[rowIndex]) {
        rows[rowIndex] = []
      }
      for (let colIndex = merge.s.c; colIndex <= merge.e.c; colIndex += 1) {
        if (rows[rowIndex][colIndex] === '' || rows[rowIndex][colIndex] == null) {
          rows[rowIndex][colIndex] = topLeftValue
        }
      }
    }
  }

  return rows
}

function normalizeText(value: string | number | null | undefined) {
  return String(value ?? '').replace(/\s+/g, '').trim()
}

function toNumber(value: unknown) {
  const parsed = Number(String(value ?? '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function hasPositiveNumber(value: unknown) {
  return toNumber(value) > 0
}

function createStableId(seed: string, index: number) {
  return `${seed || 'ITEM'}-${index + 1}`
    .replace(/[^\w\u4e00-\u9fa5-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function distributeDeclaredQuantities(totalQuantity: number, placementCount: number) {
  const safePlacementCount = Math.max(1, placementCount)
  const base = Math.floor(totalQuantity / safePlacementCount)
  let remainder = totalQuantity % safePlacementCount

  return Array.from({ length: safePlacementCount }, () => {
    const next = base + (remainder > 0 ? 1 : 0)
    if (remainder > 0) {
      remainder -= 1
    }
    return next
  })
}

function expandImportedBoxNumbers(rawBoxNo: string, placementCount: number, fallbackSeed: string) {
  const fallback = Array.from(
    { length: Math.max(1, placementCount) },
    (_, index) => `${fallbackSeed}-${index + 1}`,
  )
  const normalized = (rawBoxNo ?? '').trim()

  if (!normalized) {
    return fallback
  }

  const directParts = normalized
    .split(/[、,，/]/)
    .map((part) => part.trim())
    .filter(Boolean)

  let expandedParts: string[] = []

  for (const part of directParts.length > 0 ? directParts : [normalized]) {
    const rangeMatch = part.match(/^([A-Za-z]*)(\d+)\s*-\s*([A-Za-z]*)(\d+)$/)
    if (!rangeMatch) {
      expandedParts.push(part)
      continue
    }

    const [, startPrefix, startRaw, endPrefix, endRaw] = rangeMatch
    const prefix = startPrefix || endPrefix
    if ((startPrefix && endPrefix && startPrefix !== endPrefix) || !prefix) {
      expandedParts.push(part)
      continue
    }

    const start = Number(startRaw)
    const end = Number(endRaw)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
      expandedParts.push(part)
      continue
    }

    const width = Math.max(startRaw.length, endRaw.length)
    for (let current = start; current <= end; current += 1) {
      expandedParts.push(`${prefix}${String(current).padStart(width, '0')}`)
    }
  }

  if (expandedParts.length === placementCount) {
    return expandedParts
  }

  if (expandedParts.length === 1 && placementCount > 1) {
    return fallback.map((_, index) => `${expandedParts[0]}-${index + 1}`)
  }

  if (expandedParts.length > placementCount) {
    return expandedParts.slice(0, placementCount)
  }

  return [...expandedParts, ...fallback.slice(expandedParts.length)]
}

function round(value: number, digits: number) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function resolveSupplierFlag(value: unknown): ItemInput['supplierFlag'] {
  const remark = normalizeText(value as string | number | null | undefined)
  if (!remark) {
    return 'self'
  }

  if (/(第三方|三方|外协|拼柜|其他供应商|他方|外部)/i.test(remark)) {
    return 'other'
  }

  return 'self'
}
