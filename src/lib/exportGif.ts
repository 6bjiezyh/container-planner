import { GIFEncoder, applyPalette, quantize } from 'gifenc'
import type { ContainerPlan } from './containerPlanner'

const CANVAS_WIDTH = 960
const CANVAS_HEIGHT = 640
const MARGIN = 56

export function renderPlanFrame(
  context: CanvasRenderingContext2D,
  plan: ContainerPlan,
  visibleCount: number,
) {
  context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
  context.fillStyle = '#f4f1e8'
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  context.fillStyle = '#111111'
  context.font = '700 28px Georgia'
  context.fillText(`Container Planner / ${plan.containerType}`, MARGIN, 40)
  context.font = '400 16px Georgia'
  context.fillStyle = '#5e574e'
  context.fillText(
    `Units ${plan.summary.totalUnits} · Utilization ${(plan.summary.utilizationRatio * 100).toFixed(1)}%`,
    MARGIN,
    68,
  )

  const containerWidth = CANVAS_WIDTH - MARGIN * 2
  const containerHeight =
    ((CANVAS_HEIGHT - 190) * plan.container.widthCm) / plan.container.lengthCm
  const originX = MARGIN
  const originY = 108

  context.fillStyle = '#ebe3d1'
  context.strokeStyle = '#1d1b18'
  context.lineWidth = 3
  roundRect(context, originX, originY, containerWidth, containerHeight, 16)
  context.fill()
  context.stroke()

  const visiblePlacements = plan.placements.slice(0, visibleCount)
  visiblePlacements.forEach((placement, index) => {
    const x = originX + (placement.xCm / plan.container.lengthCm) * containerWidth
    const y = originY + (placement.yCm / plan.container.widthCm) * containerHeight
    const width = (placement.lengthCm / plan.container.lengthCm) * containerWidth
    const height = (placement.widthCm / plan.container.widthCm) * containerHeight
    const hue = 20 + ((index * 39) % 180)
    context.fillStyle = `hsl(${hue} 78% 58%)`
    context.strokeStyle = '#17120f'
    context.lineWidth = 2
    roundRect(context, x, y, width, height, 8)
    context.fill()
    context.stroke()

    context.fillStyle = '#17120f'
    context.font = '600 12px Menlo'
    context.fillText(`${index + 1}`, x + 8, y + 18)
  })

  context.fillStyle = '#17120f'
  context.font = '700 18px Georgia'
  context.fillText('Loading sequence', MARGIN, originY + containerHeight + 42)

  context.font = '400 14px Georgia'
  context.fillStyle = '#4b443b'
  plan.placements.slice(0, Math.min(visibleCount, 8)).forEach((placement, index) => {
    context.fillText(
      `${index + 1}. ${placement.label} / layer ${placement.layer + 1}`,
      MARGIN,
      originY + containerHeight + 72 + index * 22,
    )
  })

  if (visibleCount >= plan.placements.length) {
    context.fillStyle = '#0a7d44'
    context.font = '700 18px Georgia'
    context.fillText('Plan complete', CANVAS_WIDTH - 210, CANVAS_HEIGHT - 32)
  }
}

export async function exportPlanAsGif(plan: ContainerPlan) {
  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_WIDTH
  canvas.height = CANVAS_HEIGHT
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Canvas context unavailable')
  }

  const gif = GIFEncoder()
  const totalFrames = Math.max(plan.placements.length + 6, 12)

  for (let step = 0; step < totalFrames; step += 1) {
    const visibleCount = Math.min(step, plan.placements.length)
    renderPlanFrame(context, plan, visibleCount)
    const image = context.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
    const palette = quantize(image.data, 256)
    const index = applyPalette(image.data, palette)
    gif.writeFrame(index, CANVAS_WIDTH, CANVAS_HEIGHT, {
      palette,
      delay: step >= plan.placements.length ? 80 : 45,
    })
  }

  gif.finish()
  const bytes = gif.bytesView()
  const output = new Uint8Array(bytes.byteLength)
  output.set(bytes)
  return new Blob([output], { type: 'image/gif' })
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath()
  context.moveTo(x + radius, y)
  context.lineTo(x + width - radius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + radius)
  context.lineTo(x + width, y + height - radius)
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  context.lineTo(x + radius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - radius)
  context.lineTo(x, y + radius)
  context.quadraticCurveTo(x, y, x + radius, y)
  context.closePath()
}
