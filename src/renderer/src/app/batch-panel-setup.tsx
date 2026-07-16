import { FolderOpen } from 'lucide-react'
import type { ReactElement } from 'react'
import type { LocaleCopy } from '../../../shared/i18n'
import type { MediaFile } from '../../../shared/media-types'
import type { SubtitleTargetLanguageId } from '../../../shared/app-settings'

export type BatchPanelSetupProps = {
  copy: LocaleCopy
  targetLanguage: SubtitleTargetLanguageId
  directoryPath: string | null
  files: MediaFile[]
  selectedFilesCount: number
  selectedPaths: Set<string>
  includeSubfolders: boolean
  onlyMissing: boolean
  maxConcurrent: number
  maxRetries: number
  activeJob: boolean
  isScanning: boolean
  onChooseFolder: () => void
  onScanDirectory: (path: string) => void
  onIncludeSubfoldersChange: (value: boolean) => void
  onOnlyMissingChange: (value: boolean) => void
  onMaxConcurrentChange: (value: number) => void
  onMaxRetriesChange: (value: number) => void
  onSelectAll: () => void
  onClearSelection: () => void
  onToggleFile: (path: string) => void
  onTargetLanguageChange: (language: SubtitleTargetLanguageId) => void
}

export function BatchPanelSetup(props: BatchPanelSetupProps): ReactElement {
  const { copy, targetLanguage, directoryPath, files, selectedFilesCount, selectedPaths, includeSubfolders,
    onlyMissing, maxConcurrent, maxRetries, activeJob, isScanning, onChooseFolder, onScanDirectory,
    onIncludeSubfoldersChange, onOnlyMissingChange, onMaxConcurrentChange, onMaxRetriesChange,
    onSelectAll, onClearSelection, onToggleFile, onTargetLanguageChange } = props
  return (
    <>
      <div className="batch-folder-row">
        <button className="asr-action-button" type="button" onClick={onChooseFolder} disabled={isScanning || activeJob}>
          <FolderOpen size={16} />{copy.batchSubtitle.chooseFolder}
        </button>
        {directoryPath ? (
          <button className="batch-scan-button" type="button" onClick={() => onScanDirectory(directoryPath)} disabled={isScanning || activeJob}>
            {isScanning ? copy.batchSubtitle.scanning : copy.batchSubtitle.scan}
          </button>
        ) : null}
        <label className="batch-check-option">
          <input type="checkbox" checked={includeSubfolders} disabled={isScanning || activeJob} onChange={(event) => onIncludeSubfoldersChange(event.target.checked)} />
          <span>{copy.batchSubtitle.includeSubfolders}</span>
        </label>
      </div>
      <label className="batch-check-option batch-option-secondary">
        <input type="checkbox" checked={onlyMissing} disabled={isScanning || activeJob} onChange={(event) => onOnlyMissingChange(event.target.checked)} />
        <span>{copy.batchSubtitle.onlyMissing}</span>
      </label>
      <BatchChoiceRow
        label={copy.batchSubtitle.concurrency}
        values={[1, 2, 3]}
        selected={maxConcurrent}
        disabled={isScanning || activeJob}
        formatValue={copy.batchSubtitle.concurrencyValue}
        onChange={onMaxConcurrentChange}
      />
      <BatchChoiceRow
        label={copy.batchSubtitle.autoRetry}
        values={[0, 1, 2, 3]}
        selected={maxRetries}
        disabled={isScanning || activeJob}
        formatValue={copy.batchSubtitle.retryCount}
        onChange={onMaxRetriesChange}
      />
      {directoryPath ? <div className="batch-folder-path" title={directoryPath}>{directoryPath}</div> : null}
      {files.length > 0 ? (
        <div className="batch-selection-toolbar">
          <span>{copy.batchSubtitle.selectedCount(selectedFilesCount)}</span>
          <div>
            <button type="button" className="batch-text-button" onClick={onSelectAll} disabled={activeJob}>{copy.batchSubtitle.selectAll}</button>
            <button type="button" className="batch-text-button" onClick={onClearSelection} disabled={activeJob}>{copy.batchSubtitle.clearSelection}</button>
          </div>
        </div>
      ) : null}
      {isScanning ? <div className="batch-empty-state">{copy.batchSubtitle.scanning}</div> : null}
      {!isScanning && files.length === 0 ? <div className="batch-empty-state">{copy.batchSubtitle.noFiles}</div> : null}
      {files.length > 0 ? (
        <div className="batch-file-list">
          {files.map((file) => {
            const checked = selectedPaths.has(file.path)
            return (
              <label className={`batch-file-option ${checked ? 'selected' : ''}`} key={file.path}>
                <input type="checkbox" checked={checked} disabled={activeJob} onChange={() => onToggleFile(file.path)} />
                <span className="batch-file-name" title={file.path}>{file.name}</span>
                <span className="batch-file-ext">{file.extension}</span>
              </label>
            )
          })}
        </div>
      ) : null}
      <div className="batch-target-row">
        <span>{copy.batchSubtitle.targetLanguage}</span>
        <div className="subtitle-display-choice-group" role="group" aria-label={copy.batchSubtitle.targetLanguage}>
          {(['zh', 'en', 'ja', 'ko'] as SubtitleTargetLanguageId[]).map((language) => (
            <button key={language} className={`subtitle-display-choice ${targetLanguage === language ? 'is-selected' : ''}`} type="button" disabled={activeJob} aria-pressed={targetLanguage === language} onClick={() => onTargetLanguageChange(language)}>
              {copy.subtitleLanguageOptions[language].label}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

function BatchChoiceRow({
  label,
  values,
  selected,
  disabled,
  formatValue,
  onChange
}: {
  label: string
  values: number[]
  selected: number
  disabled: boolean
  formatValue: (value: number) => string
  onChange: (value: number) => void
}): ReactElement {
  return (
    <div className="batch-concurrency-row">
      <span>{label}</span>
      <div className="subtitle-display-choice-group" role="group" aria-label={label}>
        {values.map((value) => (
          <button key={value} className={`subtitle-display-choice ${selected === value ? 'is-selected' : ''}`} type="button" disabled={disabled} aria-pressed={selected === value} onClick={() => onChange(value)}>
            {formatValue(value)}
          </button>
        ))}
      </div>
    </div>
  )
}
