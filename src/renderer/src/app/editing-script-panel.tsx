import { Check, FileText, Pencil, RotateCcw, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { isEditingScriptFillerWord } from '../../../core/editing/script-operations'
import { selectEditingScriptSegmentRange } from '../../../core/editing/script-selection'
import type { EditingCaptionWord, EditingScriptSegment } from '../../../shared/editing-types'
import { formatTime } from '../lib/time'

type EditingScriptPanelProps = {
  segments: readonly EditingScriptSegment[]
  selectedSegmentId: string | null
  title: string
  hint: string
  emptyLabel: string
  deleteLabel: string
  restoreLabel: string
  restoreWithTranslationLabel: string
  orphanTranslationHint: string
  orphanTranslationSegmentIds: ReadonlySet<string>
  deletedLabel: string
  editLabel: string
  saveLabel: string
  cancelLabel: string
  editPlaceholder: string
  countLabel: (active: number, total: number) => string
  wordDeleteLabel: string
  wordReplaceLabel: string
  wordReplacePlaceholder: string
  selectedLabel: (count: number) => string
  segmentSelectedLabel: (count: number) => string
  segmentDeleteLabel: string
  segmentClearLabel: string
  fillerDeleteLabel: string
  onSelect: (segmentId: string) => void
  onUpdate: (segmentId: string, text: string) => void
  onDelete: (segmentId: string) => void
  onDeleteSegments: (segmentIds: readonly string[]) => void
  onRestore: (segmentId: string) => void
  onDeleteWord: (segmentId: string, word: EditingCaptionWord) => void
  onReplaceWord: (segmentId: string, word: EditingCaptionWord, replacementText: string) => void
  onDeleteWords: (targets: readonly { segmentId: string; word: EditingCaptionWord }[]) => void
}

type EditingScriptWordTarget = { segmentId: string; word: EditingCaptionWord }

type EditingScriptWordPopover = {
  target: EditingScriptWordTarget
  index: number
  left: number
  top: number
}

function wordKey(target: EditingScriptWordTarget): string {
  return `${target.segmentId}:${target.word.startSeconds}:${target.word.endSeconds}:${target.word.text}`
}

export function EditingScriptPanel({
  segments,
  selectedSegmentId,
  title,
  hint,
  emptyLabel,
  deleteLabel,
  restoreLabel,
  restoreWithTranslationLabel,
  orphanTranslationHint,
  orphanTranslationSegmentIds,
  deletedLabel,
  editLabel,
  saveLabel,
  cancelLabel,
  editPlaceholder,
  countLabel,
  wordDeleteLabel,
  wordReplaceLabel,
  wordReplacePlaceholder,
  selectedLabel,
  segmentSelectedLabel,
  segmentDeleteLabel,
  segmentClearLabel,
  fillerDeleteLabel,
  onSelect,
  onUpdate,
  onDelete,
  onDeleteSegments,
  onRestore,
  onDeleteWord,
  onReplaceWord,
  onDeleteWords
}: EditingScriptPanelProps): React.ReactElement {
  const panelRef = useRef<HTMLElement | null>(null)
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null)
  const [draftText, setDraftText] = useState('')
  const [selectedWords, setSelectedWords] = useState<EditingScriptWordTarget[]>([])
  const [selectedSegmentIds, setSelectedSegmentIds] = useState<string[]>([])
  const [wordPopover, setWordPopover] = useState<EditingScriptWordPopover | null>(null)
  const [replacementText, setReplacementText] = useState('')
  const activeCount = segments.filter((segment) => !segment.deleted).length
  const fillerWords = segments.flatMap((segment) => segment.deleted || !segment.words ? [] : segment.words.filter(isEditingScriptFillerWord).map((word) => ({ segmentId: segment.id, word })))
  useEffect(() => {
    setSelectedSegmentIds((current) => {
      const next = current.filter((id) => segments.some((segment) => segment.id === id && !segment.deleted))
      return next.length === current.length ? current : next
    })
  }, [segments])
  const beginEdit = (segment: EditingScriptSegment): void => {
    if (segment.deleted) return
    setSelectedSegmentIds([])
    onSelect(segment.id)
    setEditingSegmentId(segment.id)
    setDraftText(segment.text)
  }
  const cancelEdit = (): void => {
    setEditingSegmentId(null)
    setDraftText('')
  }
  const saveEdit = (segmentId: string): void => {
    if (draftText.trim()) onUpdate(segmentId, draftText)
    cancelEdit()
  }
  const closeWordActions = (): void => {
    setWordPopover(null)
    setReplacementText('')
  }
  const selectWord = (segmentId: string, word: EditingCaptionWord, index: number, shiftKey: boolean, element: HTMLButtonElement): void => {
    if (shiftKey) {
      setWordPopover(null)
      setSelectedSegmentIds([])
      setSelectedWords((current) => current.some((target) => wordKey(target) === wordKey({ segmentId, word }))
        ? current.filter((target) => wordKey(target) !== wordKey({ segmentId, word }))
        : [...current, { segmentId, word }])
      return
    }
    onSelect(segmentId)
    setSelectedSegmentIds([])
    setSelectedWords([])
    const rect = element.getBoundingClientRect()
    const popoverWidth = 220
    const popoverHeight = 104
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - popoverWidth - 8))
    const top = rect.bottom + popoverHeight < window.innerHeight - 8 ? rect.bottom + 5 : Math.max(8, rect.top - popoverHeight - 5)
    setWordPopover({ target: { segmentId, word }, index, left, top })
    setReplacementText(word.text.trim())
  }
  const handleTextSelection = (): void => {
    const selection = window.getSelection()
    const panel = panelRef.current
    if (!selection || selection.isCollapsed || !selection.toString().trim() || !panel) return
    const targets = Array.from(panel.querySelectorAll<HTMLButtonElement>('[data-editing-script-word]')).flatMap((element) => {
      try {
        if (!selection.containsNode(element, true)) return []
      } catch {
        return []
      }
      const segment = segments.find((item) => item.id === element.dataset.editingScriptSegmentId)
      const index = Number(element.dataset.editingScriptWordIndex)
      const word = Number.isInteger(index) ? segment?.words?.[index] : undefined
      return segment && word ? [{ segmentId: segment.id, word }] : []
    })
    if (targets.length > 1) {
      setSelectedWords(targets)
      setWordPopover(null)
      selection.removeAllRanges()
    }
  }
  const deleteSelectedWords = (): void => {
    if (selectedWords.length < 2) return
    onDeleteWords(selectedWords)
    setSelectedWords([])
    closeWordActions()
  }
  const toggleSegmentSelection = (segment: EditingScriptSegment): void => {
    if (segment.deleted) return
    setSelectedSegmentIds((current) => selectEditingScriptSegmentRange(segments, current, selectedSegmentId, segment.id))
  }
  const deleteSelectedSegments = (): void => {
    if (selectedSegmentIds.length === 0) return
    onDeleteSegments(selectedSegmentIds)
  }
  const replaceWord = (): void => {
    if (!wordPopover || !replacementText.trim()) return
    onReplaceWord(wordPopover.target.segmentId, wordPopover.target.word, replacementText)
    closeWordActions()
  }
  return <section ref={panelRef} className="editing-script-panel" data-testid="editing-script-panel" aria-label={title} onMouseUp={handleTextSelection} onKeyDown={(event) => { if (event.key === 'Escape') { setSelectedWords([]); setSelectedSegmentIds([]); closeWordActions() } }}>
    <div className="editing-script-heading">
      <div className="editing-script-title"><FileText size={13} aria-hidden="true" /><strong>{title}</strong><span>{countLabel(activeCount, segments.length)}</span></div>
      <p>{hint}</p>
      {selectedSegmentIds.length > 0 ? <div className="editing-script-selection-toolbar" role="status" aria-live="polite"><span>{segmentSelectedLabel(selectedSegmentIds.length)}</span><button className="editing-script-batch-action is-danger" type="button" onClick={deleteSelectedSegments} data-testid="editing-script-delete-segments"><Trash2 size={11} />{segmentDeleteLabel}</button><button className="editing-script-batch-action" type="button" onClick={() => setSelectedSegmentIds([])} data-testid="editing-script-clear-segments"><X size={11} />{segmentClearLabel}</button></div> : null}
      {selectedWords.length > 1 ? <div className="editing-script-selection-toolbar" role="status" aria-live="polite"><span>{selectedLabel(selectedWords.length)}</span><button className="editing-script-batch-action is-danger" type="button" onClick={deleteSelectedWords} data-testid="editing-script-delete-selected"><Trash2 size={11} />{wordDeleteLabel}</button></div> : null}
      {fillerWords.length > 0 ? <button className="editing-script-batch-action" type="button" onClick={() => { onDeleteWords(fillerWords); setSelectedWords([]); closeWordActions() }} data-testid="editing-script-filler-delete"><Trash2 size={11} />{fillerDeleteLabel}</button> : null}
    </div>
    {segments.length > 0 ? <div className="editing-script-list" data-testid="editing-script-list">
      {segments.map((segment) => <div key={segment.id} className={`editing-script-row ${segment.deleted ? 'is-deleted' : ''} ${selectedSegmentId === segment.id ? 'is-selected' : ''} ${selectedSegmentIds.includes(segment.id) ? 'is-segment-selected' : ''}`} data-testid={`editing-script-row-${segment.id}`}>
        {editingSegmentId === segment.id ? <div className="editing-script-editor">
          <span className="editing-script-time">{formatTime(segment.sourceStartSeconds)}–{formatTime(segment.sourceEndSeconds)}</span>
          <input className="editing-script-input" type="text" value={draftText} placeholder={editPlaceholder} aria-label={editLabel} autoFocus onChange={(event) => setDraftText(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); saveEdit(segment.id) } if (event.key === 'Escape') { event.preventDefault(); cancelEdit() } }} data-testid={`editing-script-input-${segment.id}`} />
          <div className="editing-script-editor-actions">
            <button className="editing-script-action" type="button" onClick={() => saveEdit(segment.id)} title={saveLabel} aria-label={saveLabel} data-testid={`editing-script-save-${segment.id}`}><Check size={12} /></button>
            <button className="editing-script-action" type="button" onClick={cancelEdit} title={cancelLabel} aria-label={cancelLabel} data-testid={`editing-script-cancel-${segment.id}`}><X size={12} /></button>
          </div>
        </div> : <>
          <div className="editing-script-row-main" role="button" tabIndex={segment.deleted ? -1 : 0} onClick={(event) => { if (event.shiftKey) { toggleSegmentSelection(segment); setSelectedWords([]); closeWordActions(); onSelect(segment.id); return } setSelectedSegmentIds([]); onSelect(segment.id) }} onDoubleClick={() => beginEdit(segment)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedSegmentIds([]); onSelect(segment.id) } }} aria-disabled={segment.deleted} aria-label={`${formatTime(segment.sourceStartSeconds)} ${segment.text}`}>
            <span className="editing-script-time">{formatTime(segment.sourceStartSeconds)}–{formatTime(segment.sourceEndSeconds)}</span>
            <span className="editing-script-text">{segment.words && segment.words.length > 0 ? segment.words.map((word, index) => {
              const target = { segmentId: segment.id, word }
              const selected = selectedWords.some((item) => wordKey(item) === wordKey(target))
              return <span className="editing-script-word-wrap" key={`${word.startSeconds}-${word.endSeconds}-${index}`}><button className={`editing-script-word ${selected ? 'is-selected' : ''}`} type="button" title={wordDeleteLabel} aria-label={`${wordDeleteLabel}: ${word.text.trim()}`} onClick={(event) => { event.stopPropagation(); if (!segment.deleted) selectWord(segment.id, word, index, event.shiftKey, event.currentTarget) }} data-editing-script-word="true" data-editing-script-segment-id={segment.id} data-editing-script-word-index={index} data-testid={`editing-script-word-${segment.id}-${index}`}>{word.text}</button></span>
            }) : segment.text}</span>
            {segment.deleted ? <span className="editing-script-deleted">{deletedLabel}</span> : null}
            {segment.deleted && orphanTranslationSegmentIds.has(segment.id) ? <span className="editing-script-restore-hint" data-testid={`editing-script-orphan-translation-${segment.id}`}>{orphanTranslationHint}</span> : null}
          </div>
          {!segment.deleted ? <button className="editing-script-action" type="button" onClick={() => beginEdit(segment)} title={editLabel} aria-label={editLabel} data-testid={`editing-script-edit-${segment.id}`}><Pencil size={12} /></button> : null}
          {segment.deleted ? <button className="editing-script-action" type="button" onClick={() => onRestore(segment.id)} title={orphanTranslationSegmentIds.has(segment.id) ? restoreWithTranslationLabel : restoreLabel} aria-label={orphanTranslationSegmentIds.has(segment.id) ? restoreWithTranslationLabel : restoreLabel} data-testid={`editing-script-restore-${segment.id}`} data-editing-script-restore-orphan-translation={orphanTranslationSegmentIds.has(segment.id) ? 'true' : undefined}><RotateCcw size={12} /></button> : <button className="editing-script-action is-danger" type="button" onClick={() => onDelete(segment.id)} title={deleteLabel} aria-label={deleteLabel}><Trash2 size={12} /></button>}
        </>}
      </div>)}
    </div> : <div className="editing-script-empty"><FileText size={14} aria-hidden="true" /><span>{emptyLabel}</span></div>}
    {wordPopover ? <div className="editing-script-word-popover" role="dialog" aria-label={wordReplaceLabel} style={{ left: `${wordPopover.left}px`, top: `${wordPopover.top}px` }} onClick={(event) => event.stopPropagation()}><span className="editing-script-word-popover-word">{wordPopover.target.word.text.trim()}</span><button className="editing-script-batch-action is-danger" type="button" onClick={() => { onDeleteWord(wordPopover.target.segmentId, wordPopover.target.word); closeWordActions() }} data-testid={`editing-script-word-delete-${wordPopover.target.segmentId}-${wordPopover.index}`}><Trash2 size={11} />{wordDeleteLabel}</button><span className="editing-script-replace-row"><input type="text" value={replacementText} placeholder={wordReplacePlaceholder} aria-label={wordReplaceLabel} onChange={(event) => setReplacementText(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === 'Enter') replaceWord(); if (event.key === 'Escape') closeWordActions() }} data-testid={`editing-script-word-replace-input-${wordPopover.target.segmentId}-${wordPopover.index}`} /><button className="editing-script-action" type="button" onClick={replaceWord} title={wordReplaceLabel} aria-label={wordReplaceLabel} data-testid={`editing-script-word-replace-${wordPopover.target.segmentId}-${wordPopover.index}`}><Check size={12} /></button></span></div> : null}
  </section>
}
