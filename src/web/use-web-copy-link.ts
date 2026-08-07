import { useCallback, useEffect, useState } from 'react'
import type { WebShareMediaItem, WebShareMediaLinks } from '../shared/web-types'
import { copyText, readJson } from './web-ui'

export type WebCopyLinkStatus = 'idle' | 'copying' | 'success' | 'error'

export function useWebCopyLink(selected: WebShareMediaItem | null): { copyLinkStatus: WebCopyLinkStatus; copyLinkMessage: string | null; copySelectedLink: () => Promise<void> } {
  const [copyLinkStatus, setCopyLinkStatus] = useState<WebCopyLinkStatus>('idle')
  const [copyLinkMessage, setCopyLinkMessage] = useState<string | null>(null)
  const copySelectedLink = useCallback(async (): Promise<void> => {
    if (!selected) return
    setCopyLinkStatus('copying')
    setCopyLinkMessage(null)
    try {
      const links = await readJson<WebShareMediaLinks>(`/api/v1/media/${selected.id}/link`)
      await copyText(links.url)
      setCopyLinkStatus('success')
      setCopyLinkMessage('已复制本次共享链接，停止 Web 共享后失效')
    } catch (reason) {
      setCopyLinkStatus('error')
      setCopyLinkMessage(reason instanceof Error ? reason.message : '无法复制共享链接')
    }
  }, [selected])
  useEffect(() => {
    setCopyLinkStatus('idle')
    setCopyLinkMessage(null)
  }, [selected])
  return { copyLinkStatus, copyLinkMessage, copySelectedLink }
}
