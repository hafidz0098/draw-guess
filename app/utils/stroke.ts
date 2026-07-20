import type { DrawingStroke, StrokePoint } from '~/types'

/**
 * Compress stroke points by removing near-duplicates (delta optimization).
 */
export function compressPoints(points: StrokePoint[], minDist = 1.5): StrokePoint[] {
  if (points.length <= 2) return points
  const result: StrokePoint[] = [points[0]]
  for (let i = 1; i < points.length - 1; i++) {
    const prev = result[result.length - 1]
    const cur = points[i]
    const dx = cur.x - prev.x
    const dy = cur.y - prev.y
    if (dx * dx + dy * dy >= minDist * minDist) {
      result.push(cur)
    }
  }
  result.push(points[points.length - 1])
  return result
}

/**
 * Quantize coordinates to reduce payload size.
 */
export function quantizePoints(points: StrokePoint[], precision = 1): StrokePoint[] {
  const f = 10 ** precision
  return points.map(p => ({
    x: Math.round(p.x * f) / f,
    y: Math.round(p.y * f) / f,
    ...(p.p !== undefined ? { p: Math.round(p.p * 100) / 100 } : {}),
  }))
}

export function prepareStrokeForSync(stroke: DrawingStroke): DrawingStroke {
  return {
    ...stroke,
    points: quantizePoints(compressPoints(stroke.points)),
  }
}

/**
 * Batch strokes for network send — groups by small time windows.
 */
export function batchStrokes(strokes: DrawingStroke[], maxBatch = 8): DrawingStroke[][] {
  const batches: DrawingStroke[][] = []
  for (let i = 0; i < strokes.length; i += maxBatch) {
    batches.push(strokes.slice(i, i + maxBatch))
  }
  return batches
}

/** Serialize stroke to compact array form for broadcast */
export function serializeStroke(s: DrawingStroke): unknown[] {
  return [
    s.sequence,
    s.tool,
    s.color,
    s.size,
    s.opacity,
    s.points.map(p => (p.p !== undefined ? [p.x, p.y, p.p] : [p.x, p.y])),
    s.is_eraser ? 1 : 0,
    s.timestamp_ms,
    s.shape_data ?? null,
  ]
}

export function deserializeStroke(data: unknown[], roundId: string): DrawingStroke {
  const [sequence, tool, color, size, opacity, points, isEraser, timestamp, shapeData] = data as [
    number, string, string, number, number, number[][], number, number, Record<string, unknown> | null
  ]
  return {
    round_id: roundId,
    sequence,
    tool: tool as DrawingStroke['tool'],
    color,
    size,
    opacity,
    points: (points || []).map((p) => ({
      x: p[0],
      y: p[1],
      ...(p[2] !== undefined ? { p: p[2] } : {}),
    })),
    is_eraser: !!isEraser,
    timestamp_ms: timestamp,
    shape_data: shapeData,
  }
}
