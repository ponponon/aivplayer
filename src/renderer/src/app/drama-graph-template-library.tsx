import { Boxes, GitBranch, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { DramaGraphTemplate, DramaGraphTemplateInput } from '../../../shared/drama-types'
import type { LocaleCopy } from '../../../shared/i18n'

type PresetId = 'image' | 'video' | 'audio'

type DramaGraphTemplateLibraryProps = {
  templates: readonly DramaGraphTemplate[]
  copy: LocaleCopy['drama']
  busy: boolean
  onSave: (input: DramaGraphTemplateInput) => void
  onDelete: (template: DramaGraphTemplate) => void
}

function presetFor(id: PresetId): Pick<DramaGraphTemplateInput, 'nodes' | 'edges'> {
  const output = { id: 'output', type: 'timeline-output' as const, title: '回流时间线', config: {} }
  if (id === 'image') return {
    nodes: [{ id: 'asset', type: 'asset-input', title: '资产输入', config: {} }, { id: 'image', type: 'generate-image', title: '图像生成', config: {} }, output],
    edges: [{ from: 'asset', to: 'image' }, { from: 'image', to: 'output' }]
  }
  if (id === 'video') return {
    nodes: [{ id: 'prompt', type: 'prompt', title: '提示词', config: {} }, { id: 'video', type: 'generate-video', title: '视频生成', config: {} }, output],
    edges: [{ from: 'prompt', to: 'video' }, { from: 'video', to: 'output' }]
  }
  return {
    nodes: [{ id: 'prompt', type: 'prompt', title: '提示词', config: {} }, { id: 'audio', type: 'generate-audio', title: '音频生成', config: {} }, output],
    edges: [{ from: 'prompt', to: 'audio' }, { from: 'audio', to: 'output' }]
  }
}

export function DramaGraphTemplateLibrary({ templates, copy, busy, onSave, onDelete }: DramaGraphTemplateLibraryProps): React.ReactElement {
  const [preset, setPreset] = useState<PresetId>('image')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const save = (): void => {
    if (!name.trim() || busy) return
    onSave({ name: name.trim(), description: description.trim(), ...presetFor(preset) })
    setName('')
    setDescription('')
  }

  return <section className="drama-graph-template-library" data-testid="drama-graph-template-library" aria-label={copy.graphTemplateTitle}>
    <div className="drama-generation-heading"><div><strong>{copy.graphTemplateTitle}</strong><small>{copy.graphTemplateDescription}</small></div><Boxes size={15} /></div>
    <div className="drama-graph-template-form"><div className="drama-graph-template-form-row"><label><span>{copy.graphTemplatePreset}</span><select value={preset} onChange={(event) => setPreset(event.currentTarget.value as PresetId)}><option value="image">{copy.graphTemplatePresetImage}</option><option value="video">{copy.graphTemplatePresetVideo}</option><option value="audio">{copy.graphTemplatePresetAudio}</option></select></label><label><span>{copy.graphTemplateName}</span><input value={name} onChange={(event) => setName(event.currentTarget.value)} placeholder={copy.graphTemplateNamePlaceholder} /></label></div><label><span>{copy.graphTemplateDescriptionLabel}</span><input value={description} onChange={(event) => setDescription(event.currentTarget.value)} placeholder={copy.graphTemplateDescriptionPlaceholder} /></label><button className="drama-primary-action" type="button" onClick={save} disabled={busy || !name.trim()}><Plus size={13} />{copy.graphTemplateCreate}</button></div>
    {templates.length > 0 ? <div className="drama-graph-template-list" data-testid="drama-graph-template-list">{templates.map((template) => <article className="drama-graph-template-card" key={template.id}><div className="drama-graph-template-card-heading"><strong>{template.name}</strong><button className="drama-icon-button drama-graph-template-delete" type="button" onClick={() => onDelete(template)} disabled={busy} title={copy.graphTemplateDelete} aria-label={`${copy.graphTemplateDelete}: ${template.name}`}><Trash2 size={13} /></button></div>{template.description ? <p>{template.description}</p> : null}<div className="drama-graph-template-meta"><span><GitBranch size={11} />{copy.graphTemplateNodeCount(template.nodes.length)}</span><span>{copy.graphTemplateEdgeCount(template.edges.length)}</span></div></article>)}</div> : <p className="drama-graph-template-empty">{copy.graphTemplateEmpty}</p>}
    <p className="drama-generation-hint">{copy.graphTemplateHint}</p>
  </section>
}
