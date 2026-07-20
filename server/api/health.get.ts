export default defineEventHandler(() => {
  return {
    ok: true,
    service: 'draw-guess',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  }
})
