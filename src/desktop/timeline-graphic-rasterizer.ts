import { BrowserWindow } from 'electron'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { EditingGraphic } from '../shared/editing-types'
import type { TimelineGraphicRasterizeRequest, TimelineGraphicRasterAsset } from '../core/media/timeline-export'

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function cardPosition(position: EditingGraphic['position']): string {
  if (position === 'top-left') return 'top: 8%; left: 6%;'
  if (position === 'top-right') return 'top: 8%; right: 6%;'
  if (position === 'bottom-left') return 'bottom: 8%; left: 6%;'
  if (position === 'bottom-right') return 'bottom: 8%; right: 6%;'
  return 'top: 50%; left: 50%; transform: translate(-50%, -50%);'
}

function graphicDocument(graphic: EditingGraphic, width: number, height: number): string {
  const titleSize = Math.max(24, Math.round(height * 0.08))
  const labelSize = Math.max(18, Math.round(height * 0.04))
  const cardClass = graphic.style === 'title' ? 'title' : 'label'
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    html, body { width: ${width}px; height: ${height}px; margin: 0; overflow: hidden; background: transparent; }
    body { position: relative; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif; }
    .card { position: absolute; max-width: 82%; padding: ${Math.round(height * 0.018)}px ${Math.round(width * 0.026)}px; color: #fff; text-align: center; white-space: pre-wrap; overflow-wrap: anywhere; background: rgba(12, 14, 18, .78); border: 1px solid rgba(255, 255, 255, .18); box-shadow: 0 ${Math.max(4, Math.round(height * 0.012))}px ${Math.max(12, Math.round(height * 0.03))}px rgba(0, 0, 0, .22); ${cardPosition(graphic.position)} }
    .title { border-radius: ${Math.max(10, Math.round(height * 0.018))}px; font-size: ${titleSize}px; font-weight: 800; line-height: 1.1; letter-spacing: .02em; }
    .title i { display: block; width: 52px; height: 3px; margin-top: ${Math.max(5, Math.round(height * 0.01))}px; background: rgb(236, 188, 88); border-radius: 2px; }
    .label { border-left: ${Math.max(3, Math.round(height * 0.004))}px solid rgb(236, 188, 88); border-radius: ${Math.max(7, Math.round(height * 0.012))}px; font-size: ${labelSize}px; font-weight: 700; line-height: 1.25; }
  </style></head><body><div class="card ${cardClass}">${graphic.style === 'title' ? `<strong>${escapeHtml(graphic.text)}</strong><i></i>` : escapeHtml(graphic.text)}</div></body></html>`
}

async function loadGraphicDocument(window: BrowserWindow, graphic: EditingGraphic, width: number, height: number): Promise<void> {
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(graphicDocument(graphic, width, height))}`)
  await window.webContents.executeJavaScript('document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true')
}

export async function renderTimelineGraphicAssets(request: TimelineGraphicRasterizeRequest): Promise<readonly TimelineGraphicRasterAsset[]> {
  const window = new BrowserWindow({
    show: false,
    transparent: true,
    frame: false,
    resizable: false,
    width: request.width,
    height: request.height,
    backgroundColor: '#00000000',
    webPreferences: { offscreen: true, sandbox: true }
  })
  try {
    const assets: TimelineGraphicRasterAsset[] = []
    for (const [index, graphic] of request.graphics.entries()) {
      await loadGraphicDocument(window, graphic, request.width, request.height)
      let image = await window.webContents.capturePage({ x: 0, y: 0, width: request.width, height: request.height })
      const size = image.getSize()
      if (size.width !== request.width || size.height !== request.height) image = image.resize({ width: request.width, height: request.height })
      const imagePath = join(request.outputDirectory, `graphic-${String(index).padStart(4, '0')}.png`)
      await writeFile(imagePath, image.toPNG())
      assets.push({ graphicId: graphic.id, imagePath })
    }
    return assets
  } finally {
    if (!window.isDestroyed()) window.destroy()
  }
}
