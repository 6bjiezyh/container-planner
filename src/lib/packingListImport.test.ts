import { describe, expect, it } from 'vitest'
import { parsePackingListRows } from './packingListImport'

describe('packing list import', () => {
  it('merges split rows from the fixed packing list format into outer-box items', () => {
    const items = parsePackingListRows([
      ['序号', '编码', 'PI序列号', '品名', '数量', '箱数', '箱号', '长', '宽', '高', '重量', '总重量'],
      ['1', 'ZY-001', 'PI-001', '餐边柜', '10', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '2', 'A01-A02', '120', '80', '100', '20', '200'],
    ])

    expect(items).toHaveLength(2)
    expect(items[0].label).toBe('餐边柜')
    expect(items[0].productCode).toBe('ZY-001')
    expect(items[0].piNo).toBe('PI-001')
    expect(items[0].quantity).toBe(5)
    expect(items[0].boxCount).toBe(1)
    expect(items[0].boxNo).toBe('A01')
    expect(items[0].dimensionInputMode).toBe('outer_box')
    expect(items[0].lengthCm).toBe(120)
    expect(items[0].singleWeightKg).toBe(20)
    expect(items[1].quantity).toBe(5)
    expect(items[1].boxNo).toBe('A02')
  })

  it('marks rows as third-party cargo when the remark column says 第三方', () => {
    const items = parsePackingListRows([
      ['序号', '编码', 'PI序列号', '品名', '数量', '箱数', '箱号', '备注', '长', '宽', '高', '重量', '总重量'],
      ['1', 'ZY-002', 'PI-002', '花架', '6', '1', 'B01', '第三方', '60', '40', '50', '12', '72'],
    ])

    expect(items).toHaveLength(1)
    expect(items[0].supplierFlag).toBe('other')
  })
})
