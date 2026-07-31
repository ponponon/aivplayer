import { BrowserWindow } from 'electron'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { EditingGraphic } from '../shared/editing-types'
import type { TimelineGraphicRasterizeRequest, TimelineGraphicRasterAsset } from '../core/media/timeline-export'
import { getEditingFrame } from '../core/editing/frames'

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

function graphicDocument(graphic: EditingGraphic, frameId: TimelineGraphicRasterizeRequest['frameId'], width: number, height: number): string {
  const frame = getEditingFrame(frameId)
  const titleSize = Math.max(24, Math.round(height * 0.08))
  const labelSize = Math.max(18, Math.round(height * 0.04))
  const cardClass = graphic.style === 'title' ? 'title' : 'label'
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    html, body { width: ${width}px; height: ${height}px; margin: 0; overflow: hidden; background: transparent; }
    body { position: relative; font-family: ${frame.fontFamily}; }
    .card { position: absolute; max-width: 82%; padding: ${Math.round(height * 0.018)}px ${Math.round(width * 0.026)}px; color: ${frame.cardText}; text-align: center; white-space: pre-wrap; overflow-wrap: anywhere; background: ${frame.cardBackground}; border: 1px solid ${frame.cardBorder}; border-radius: ${frame.radius}; box-shadow: ${frame.cardShadow}; ${cardPosition(graphic.position)} }
    .title { border-radius: ${Math.max(10, Math.round(height * 0.018))}px; font-size: ${titleSize}px; font-weight: 800; line-height: 1.1; letter-spacing: .02em; }
    .title i { display: block; width: 52px; height: 3px; margin-top: ${Math.max(5, Math.round(height * 0.01))}px; background: ${frame.accent}; border-radius: 2px; }
    .label { border-left: ${Math.max(3, Math.round(height * 0.004))}px solid ${frame.accent}; font-size: ${labelSize}px; font-weight: 700; line-height: 1.25; }
    .sticker { border: 0; text-shadow: none; transform: rotate(-1deg); }
    .outline { background: rgba(0, 0, 0, .18); border-width: 2px; }
    .cinema { letter-spacing: .08em; text-transform: uppercase; }
    .serif { font-style: italic; }
  </style></head><body><div class="card ${cardClass} ${frame.graphicVariant}">${graphic.style === 'title' ? `<strong>${escapeHtml(graphic.text)}</strong><i></i>` : escapeHtml(graphic.text)}</div></body></html>`
}

async function loadGraphicDocument(window: BrowserWindow, graphic: EditingGraphic, frameId: TimelineGraphicRasterizeRequest['frameId'], width: number, height: number): Promise<void> {
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(graphicDocument(graphic, frameId, width, height))}`)
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
      await loadGraphicDocument(window, graphic, request.frameId, request.width, request.height)
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
