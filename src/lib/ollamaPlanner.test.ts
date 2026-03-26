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
          sequencePreview: ['SKU-A-0', 'SKU-B-0'],
        },
      ],
    })

    expect(prompt).toContain('40HQ')
    expect(prompt).toContain('1203×235×269cm')
    expect(prompt).toContain('volume-desc')
    expect(prompt).toContain('体积优先')
    expect(prompt).toContain('底层件数')
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
})
