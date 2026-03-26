import { describe, expect, it } from 'vitest'
import {
  buildOllamaPackingPrompt,
  parseOllamaPackingResponse,
} from './ollamaPlanner'

describe('ollama packing planner', () => {
  it('builds a prompt with candidate summaries for qwen to choose from', () => {
    const prompt = buildOllamaPackingPrompt({
      containerType: '40HQ',
      container: {
        lengthCm: 1203,
        widthCm: 235,
        heightCm: 269,
      },
      candidates: [
        {
          candidateId: 'volume-desc',
          strategyLabel: '体积优先',
          utilizationRatio: 0.71,
          unpackedItems: 0,
          floorPlacements: 8,
          stackedPlacements: 2,
          usedLengthCm: 820,
          tailFreeLengthCm: 383,
          usedHeightCm: 188,
          sequencePreview: ['SKU-A-0', 'SKU-B-0'],
        },
      ],
    })

    expect(prompt).toContain('40HQ')
    expect(prompt).toContain('1203×235×269cm')
    expect(prompt).toContain('volume-desc')
    expect(prompt).toContain('体积优先')
    expect(prompt).toContain('底层件数')
    expect(prompt).toContain('预留尾仓长度')
    expect(prompt).toContain('主动堆叠')
  })

  it('parses qwen json output into candidate selection and explanation', () => {
    const parsed = parseOllamaPackingResponse(`{
      "candidateId": "floor-first",
      "explanation": [
        "先放底面积更大的货物",
        "把相同货物连续装入"
      ]
    }`)

    expect(parsed.candidateId).toBe('floor-first')
    expect(parsed.explanation).toEqual([
      '先放底面积更大的货物',
      '把相同货物连续装入',
    ])
  })

  it('deduplicates repeated explanation lines from qwen', () => {
    const parsed = parseOllamaPackingResponse(`{
      "candidateId": "volume-desc",
      "explanation": [
        "体积优先方案在装柜时会优先考虑货物体积的合理分配，有助于提高空间利用率。",
        "体积优先方案在装柜时会优先考虑货物体积的合理分配，有助于提高空间利用率。",
        "底层件数为1，说明货物在底层有良好的铺底，有助于减少底部空洞，提升稳定性。",
        "底层件数为1，说明货物在底层有良好的铺底，有助于减少底部空洞，提升稳定性。"
      ]
    }`)

    expect(parsed.explanation).toEqual([
      '体积优先方案在装柜时会优先考虑货物体积的合理分配，有助于提高空间利用率。',
      '底层件数为1，说明货物在底层有良好的铺底，有助于减少底部空洞，提升稳定性。',
    ])
  })

  it('splits string explanation into cleaned bullet lines', () => {
    const parsed = parseOllamaPackingResponse(`{
      "candidateId": "floor-first",
      "explanation": "1. 先铺底\\n2. 减少空洞\\n3. 减少空洞"
    }`)

    expect(parsed.explanation).toEqual(['先铺底', '减少空洞'])
  })
})
