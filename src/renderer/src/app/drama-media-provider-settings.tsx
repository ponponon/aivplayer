import { Image, Music2, Save, Video } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { DramaGenerationMediaType, DramaMediaProviderSettings, DramaMediaProviderSettingsInput } from '../../../shared/drama-types'
import type { LocaleCopy } from '../../../shared/i18n'

type MediaProviderDraft = {
  providerId: string
  apiBaseUrl: string
  model: string
  apiKey: string
  costPerRequest: string
}

type DramaMediaProviderSettingsProps = {
  settings: Record<DramaGenerationMediaType, DramaMediaProviderSettings>
  copy: LocaleCopy['drama']
  busy: boolean
  onSave: (mediaType: DramaGenerationMediaType, input: DramaMediaProviderSettingsInput) => void
}

const MEDIA_TYPES: readonly DramaGenerationMediaType[] = ['image', 'video', 'audio']

export function DramaMediaProviderSettingsPanel({ settings, copy, busy, onSave }: DramaMediaProviderSettingsProps): React.ReactElement {
  const [drafts, setDrafts] = useState<Record<DramaGenerationMediaType, MediaProviderDraft>>(() => createDrafts(settings))

  useEffect(() => {
    setDrafts(createDrafts(settings))
  }, [settings])

  const update = (mediaType: DramaGenerationMediaType, patch: Partial<MediaProviderDraft>): void => {
    setDrafts((current) => ({ ...current, [mediaType]: { ...current[mediaType], ...patch } }))
  }

  const save = (mediaType: DramaGenerationMediaType): void => {
    const draft = drafts[mediaType]
    const cost = draft.costPerRequest.trim() ? Number(draft.costPerRequest) : null
    onSave(mediaType, {
      providerId: draft.providerId.trim() || null,
      apiBaseUrl: draft.apiBaseUrl.trim() || null,
      model: draft.model.trim() || null,
      apiKey: draft.apiKey.trim() || undefined,
      costPerRequest: cost != null && Number.isFinite(cost) && cost >= 0 ? cost : null
    })
  }

  return <section className="drama-media-provider-settings" data-testid="drama-media-provider-settings" aria-label={copy.mediaProviderTitle}>
    <div className="drama-section-heading"><strong>{copy.mediaProviderTitle}</strong><small>{copy.mediaProviderDescription}</small></div>
    <div className="drama-media-provider-list">{MEDIA_TYPES.map((mediaType) => {
      const draft = drafts[mediaType]
      return <article className="drama-media-provider-card" key={mediaType}>
        <div className="drama-media-provider-card-heading"><span>{mediaIcon(mediaType)}{mediaLabel(mediaType, copy)}</span><small>{settings[mediaType].apiKeyConfigured ? copy.mediaProviderConfigured : copy.mediaProviderUnconfigured}</small></div>
        <div className="drama-media-provider-fields">
          <input value={draft.providerId} onChange={(event) => update(mediaType, { providerId: event.currentTarget.value })} placeholder={copy.mediaProviderId} aria-label={`${mediaLabel(mediaType, copy)} ${copy.mediaProviderId}`} disabled={busy} />
          <input value={draft.apiBaseUrl} onChange={(event) => update(mediaType, { apiBaseUrl: event.currentTarget.value })} placeholder={copy.mediaProviderBaseUrl} aria-label={`${mediaLabel(mediaType, copy)} ${copy.mediaProviderBaseUrl}`} disabled={busy} />
          <input value={draft.model} onChange={(event) => update(mediaType, { model: event.currentTarget.value })} placeholder={copy.mediaProviderModel} aria-label={`${mediaLabel(mediaType, copy)} ${copy.mediaProviderModel}`} disabled={busy} />
          <input type="password" value={draft.apiKey} onChange={(event) => update(mediaType, { apiKey: event.currentTarget.value })} placeholder={settings[mediaType].apiKeyConfigured ? copy.mediaProviderKeyConfigured : copy.mediaProviderKey} aria-label={`${mediaLabel(mediaType, copy)} ${copy.mediaProviderKey}`} autoComplete="new-password" disabled={busy} />
          <input type="number" min="0" step="0.000001" value={draft.costPerRequest} onChange={(event) => update(mediaType, { costPerRequest: event.currentTarget.value })} placeholder={copy.mediaProviderCost} aria-label={`${mediaLabel(mediaType, copy)} ${copy.mediaProviderCost}`} disabled={busy} />
        </div>
        <button className="drama-secondary-action" type="button" onClick={() => save(mediaType)} disabled={busy}><Save size={13} />{copy.mediaProviderSave}</button>
      </article>
    })}</div>
  </section>
}

function createDrafts(settings: Record<DramaGenerationMediaType, DramaMediaProviderSettings>): Record<DramaGenerationMediaType, MediaProviderDraft> {
  return Object.fromEntries(MEDIA_TYPES.map((mediaType) => {
    const provider = settings[mediaType]
    return [mediaType, {
      providerId: provider.providerId ?? '',
      apiBaseUrl: provider.apiBaseUrl ?? '',
      model: provider.model ?? '',
      apiKey: '',
      costPerRequest: provider.costPerRequest == null ? '' : String(provider.costPerRequest)
    }]
  })) as Record<DramaGenerationMediaType, MediaProviderDraft>
}

function mediaLabel(mediaType: DramaGenerationMediaType, copy: LocaleCopy['drama']): string {
  return mediaType === 'image' ? copy.generationMediaImage : mediaType === 'video' ? copy.generationMediaVideo : copy.generationMediaAudio
}

function mediaIcon(mediaType: DramaGenerationMediaType): React.ReactElement {
  return mediaType === 'image' ? <Image size={13} aria-hidden="true" /> : mediaType === 'video' ? <Video size={13} aria-hidden="true" /> : <Music2 size={13} aria-hidden="true" />
}
