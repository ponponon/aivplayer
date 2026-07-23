import { Database, FolderOpen, FolderSync, X } from 'lucide-react'
import type { LocaleCopy } from '../../../shared/i18n'
import type { VisionDirectoryBatchScanProgress, VisionDirectoryScanProgress } from '../../../shared/vision-types'

type VisionLibraryFolderProps = {
  copy: LocaleCopy['vision']
  folderPath: string | null
  savedFolders: string[]
  videoPaths: string[]
  includeSubfolders: boolean
  scanProgress: VisionDirectoryScanProgress | null
  batchScanProgress: VisionDirectoryBatchScanProgress | null
  isBusy: boolean
  onChooseFolder: () => void
  onScanFolder: () => void
  onScanAllFolders: () => void
  onIncludeSubfoldersChange: (value: boolean) => void
  onStartIndex: () => void
  onUseFolder: (folderPath: string) => void
  onRemoveFolder: (folderPath: string) => void
}

export function VisionLibraryFolder({ copy, folderPath, savedFolders, videoPaths, includeSubfolders, scanProgress, batchScanProgress, isBusy, onChooseFolder, onScanFolder, onScanAllFolders, onIncludeSubfoldersChange, onStartIndex, onUseFolder, onRemoveFolder }: VisionLibraryFolderProps): React.ReactElement {
  return <>
    <div className="vision-folder-actions">
      <button className="vision-secondary-action" type="button" onClick={onChooseFolder} disabled={isBusy}><FolderOpen size={15} />{copy.chooseFolder}</button>
      {folderPath ? <button className="vision-secondary-action" type="button" onClick={onScanFolder} disabled={isBusy}>{copy.scanFolder}</button> : null}
      {savedFolders.length > 0 ? <button className="vision-secondary-action" type="button" onClick={onScanAllFolders} disabled={isBusy}><FolderSync size={15} />{copy.scanAllFolders}</button> : null}
      <label className="vision-folder-option"><input type="checkbox" checked={includeSubfolders} disabled={isBusy} onChange={(event) => onIncludeSubfoldersChange(event.target.checked)} /><span>{copy.includeSubfolders}</span></label>
    </div>
    {folderPath ? <div className="vision-folder-path" title={folderPath}>{folderPath}</div> : null}
    {savedFolders.length > 0 ? <div className="vision-saved-folders"><small>{copy.savedFolders}</small>{savedFolders.map((savedFolder) => <div className="vision-saved-folder" key={savedFolder}><button type="button" onClick={() => onUseFolder(savedFolder)} disabled={isBusy} title={savedFolder}>{savedFolder}</button><button type="button" onClick={() => onRemoveFolder(savedFolder)} disabled={isBusy} aria-label={`${copy.removeFolder}: ${savedFolder}`} title={copy.removeFolder}><X size={13} /></button></div>)}</div> : null}
    {batchScanProgress ? <div className="vision-scan-progress" role="status"><span>{batchScanProgress.status === 'scanning' ? copy.scanningFolders(batchScanProgress.completedDirectories, batchScanProgress.totalDirectories, batchScanProgress.discoveredVideos) : batchScanProgress.status === 'completed' ? copy.batchScanSummary(batchScanProgress.completedDirectories, batchScanProgress.discoveredVideos, batchScanProgress.failedDirectories) : copy.batchScanCancelled(batchScanProgress.completedDirectories, batchScanProgress.discoveredVideos)}</span><span title={batchScanProgress.currentDirectoryPath}>{(batchScanProgress.currentPath ?? batchScanProgress.currentDirectoryPath)?.split(/[\\/]/).pop() ?? ''}</span></div> : scanProgress?.status === 'scanning' ? <div className="vision-scan-progress" role="status"><span>{copy.scanningFolder(scanProgress.scannedDirectories, scanProgress.discoveredVideos)}</span><span>{scanProgress.currentPath?.split(/[\\/]/).pop() ?? ''}</span></div> : null}
    {videoPaths.length > 0 ? <div className="vision-folder-summary"><span>{copy.folderVideoCount(videoPaths.length)}</span><button className="vision-primary-action" type="button" onClick={onStartIndex} disabled={isBusy}><Database size={15} />{copy.indexFolder}</button></div> : null}
  </>
}
