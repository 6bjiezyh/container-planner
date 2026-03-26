import { describe, expect, it } from 'vitest'
import { parsePackingListRows } from './packingListImport'

describe('packing list import', () => {
  it('merges split rows from the fixed packing list format into outer-box items', () => {
    const items = parsePackingListRows([
      ['序号', '编码', 'PI序列号', '品名', '数量', '箱数', '箱号', '长', '宽', '高', '重量', '总重量'],
      ['1', 'ZY-001', 'PI-001', '餐边柜', '10', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '2', 'A01-A02', '120', '80', '100', '20', '200'],
    ])

    expect(items).toHaveLength(1)
    expect(items[0].label).toBe('餐边柜')
    expect(items[0].productCode).toBe('ZY-001')
    expect(items[0].piNo).toBe('PI-001')
    expect(items[0].quantity).toBe(10)
    expect(items[0].boxCount).toBe(2)
    expect(items[0].boxNo).toBe('A01-A02')
    expect(items[0].dimensionInputMode).toBe('outer_box')
    expect(items[0].lengthCm).toBe(120)
    expect(items[0].singleWeightKg).toBe(20)
  })
})
