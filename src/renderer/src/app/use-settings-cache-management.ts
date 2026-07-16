import { useCallback, useEffect, useState } from 'react'
import type { AsrCacheStats } from '../../../shared/media-types'
import type { LocaleCopy } from '../../../shared/i18n'

export type SettingsCacheManagement = {
  cacheStats: AsrCacheStats | null
  cacheStatus: { success: boolean; message: string } | null
  isLoadingCacheStats: boolean
  isClearingCache: boolean
  refreshCacheStats: () => void
  clearStaleCache: () => void
}

export function useSettingsCacheManagement(copy: LocaleCopy): SettingsCacheManagement {
  const [cacheStats, setCacheStats] = useState<AsrCacheStats | null>(null)
  const [cacheStatus, setCacheStatus] = useState<{ success: boolean; message: string } | null>(null)
  const [isLoadingCacheStats, setIsLoadingCacheStats] = useState(false)
  const [isClearingCache, setIsClearingCache] = useState(false)
  const cacheCopy = copy.settingsDialog.subtitles.cache

  const refreshCacheStats = useCallback(async (): Promise<void> => {
    setIsLoadingCacheStats(true)
    try {
      const result = await window.aiv.getAsrCacheStats()
      setCacheStats(result.stats)
      setCacheStatus(result.success ? null : { success: false, message: result.message })
    } catch (error) {
      setCacheStatus({ success: false, message: error instanceof Error ? error.message : String(error) })
    } finally {
      setIsLoadingCacheStats(false)
    }
  }, [])

  const clearStaleCache = useCallback(async (): Promise<void> => {
    setIsClearingCache(true)
    try {
      const result = await window.aiv.clearStaleAsrCache()
      setCacheStats(result.stats)
      setCacheStatus({ success: result.success, message: result.success ? cacheCopy.clearDone(result.deletedFiles, result.deletedBytes) : result.message })
    } catch (error) {
      setCacheStatus({ success: false, message: error instanceof Error ? error.message : String(error) })
    } finally {
      setIsClearingCache(false)
    }
  }, [cacheCopy])

  useEffect(() => {
    void refreshCacheStats()
  }, [refreshCacheStats])

  return {
    cacheStats,
    cacheStatus,
    isLoadingCacheStats,
    isClearingCache,
    refreshCacheStats: () => { void refreshCacheStats() },
    clearStaleCache: () => { void clearStaleCache() }
  }
}
