import { Pencil, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { ReactElement } from 'react'
import {
  MANAGED_AI_PROVIDER_ID,
  MAX_AI_PROVIDER_PROFILES,
  createCustomAiProvider,
  resolveActiveAiProvider,
  type AiProviderProfile
} from '../../../../shared/ai-providers'
import { SettingsField, SettingsSelect } from '../settings-controls'
import { SettingsTextInput } from '../settings-inputs'
import type { SettingsSectionProps } from '../settings-section-types'

type AiProviderDraft = { name: string; baseUrl: string; model: string; apiKey: string }

function getProviderDisplayName(copy: SettingsSectionProps['copy'], provider: AiProviderProfile): string {
  if (provider.name) return provider.name
  return provider.kind === 'managed'
    ? copy.settingsDialog.aiService.managedProviderName
    : copy.settingsDialog.aiService.customProviderName
}

export function AiServiceSettingsSection({
  copy,
  settings,
  patchSettingsSection,
  translationServiceTestMessage,
  isTestingTranslationService,
  translationServiceSourceLanguageLabel,
  translationServiceTargetLanguageLabel,
  translationServiceEndpointSummary,
  onTestTranslationService
}: SettingsSectionProps): ReactElement {
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null)
  const [draft, setDraft] = useState<AiProviderDraft | null>(null)

  const activeProvider = resolveActiveAiProvider(settings.ai.providers, settings.ai.activeProviderId)
  const providerOptions = settings.ai.providers.map((provider) => ({
    value: provider.id,
    label: getProviderDisplayName(copy, provider)
  }))
  const isEditing = editingProviderId !== null && draft !== null

  const startEditing = (provider: AiProviderProfile): void => {
    setEditingProviderId(provider.id)
    setDraft({ name: provider.name, baseUrl: provider.baseUrl ?? '', model: provider.model ?? '', apiKey: provider.apiKey ?? '' })
  }
  const resetEditing = (): void => {
    setEditingProviderId(null)
    setDraft(null)
  }
  const startCreating = (): void => {
    const provider = createCustomAiProvider(`custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`)
    patchSettingsSection('ai', (current) => ({
      ...current,
      providers: [...current.providers, provider],
      activeProviderId: provider.id
    }))
    startEditing(provider)
  }
  const saveEditing = (): void => {
    if (!editingProviderId || !draft) return
    patchSettingsSection('ai', (current) => ({
      ...current,
      providers: current.providers.map((provider) =>
        provider.id === editingProviderId
          ? {
              ...provider,
              name: draft.name.trim(),
              kind: 'custom' as const,
              baseUrl: draft.baseUrl.trim() || null,
              model: draft.model.trim() || null,
              apiKey: draft.apiKey.trim() || null
            }
          : provider
      )
    }))
    resetEditing()
  }
  const deleteProvider = (providerId: string): void => {
    if (providerId === MANAGED_AI_PROVIDER_ID) return
    patchSettingsSection('ai', (current) => ({
      ...current,
      providers: current.providers.filter((provider) => provider.id !== providerId),
      activeProviderId: current.activeProviderId === providerId ? MANAGED_AI_PROVIDER_ID : current.activeProviderId
    }))
    if (editingProviderId === providerId) resetEditing()
  }
  const testDraftProvider = (): void => {
    onTestTranslationService(
      draft
        ? { kind: 'custom' as const, baseUrl: draft.baseUrl.trim() || null, model: draft.model.trim() || null, apiKey: draft.apiKey.trim() || null }
        : undefined
    )
  }

  return (
    <>
      <div className="settings-note-box">
        <span className="settings-note-title">{copy.settingsDialog.aiService.title}</span>
        <p>{copy.settingsDialog.aiService.introDescription}</p>
      </div>
      <SettingsField title={copy.settingsDialog.aiService.activeProvider} description={copy.settingsDialog.subtitles.translationServiceModeDescription}>
        <SettingsSelect
          value={settings.ai.activeProviderId}
          options={providerOptions}
          onChange={(activeProviderId) => patchSettingsSection('ai', { activeProviderId })}
        />
      </SettingsField>
      {activeProvider.kind === 'managed' ? (
        <div className="settings-note-box">
          <span className="settings-note-title">{copy.settingsDialog.subtitles.translationServiceManagedTitle}</span>
          <p>{copy.settingsDialog.subtitles.translationServiceManagedDescription}</p>
        </div>
      ) : null}
      <div className="settings-field settings-card-wide settings-cache-management">
        <div className="settings-field-copy">
          <strong>{copy.settingsDialog.aiService.profileListTitle}</strong>
          <small>{copy.settingsDialog.subtitles.translationServiceDescription}</small>
        </div>
        <div className="settings-inline-row settings-cache-actions">
          <button
            className="settings-secondary-button"
            type="button"
            onClick={startCreating}
            disabled={isEditing || settings.ai.providers.length >= MAX_AI_PROVIDER_PROFILES}
          >
            <Plus size={14} />
            {copy.settingsDialog.aiService.addProfile}
          </button>
        </div>
        {settings.ai.providers.map((provider) => (
          <div className="settings-field-copy" key={provider.id}>
            <strong>{getProviderDisplayName(copy, provider)}</strong>
            <small>
              {provider.kind === 'managed'
                ? copy.settingsDialog.aiService.managedBadge
                : copy.settingsDialog.aiService.customBadge}
              {settings.ai.activeProviderId === provider.id ? ` · ${copy.settingsDialog.aiService.activeBadge}` : ''}
              {provider.model ? ` · ${provider.model}` : ''}
            </small>
            {provider.kind === 'custom' ? (
              <div className="settings-inline-row settings-cache-actions">
                <button className="settings-secondary-button" type="button" onClick={() => startEditing(provider)} disabled={isEditing}>
                  <Pencil size={14} />
                  {copy.settingsDialog.aiService.editProfile}
                </button>
                <button className="settings-secondary-button" type="button" onClick={() => deleteProvider(provider.id)} disabled={isEditing}>
                  <Trash2 size={14} />
                  {copy.settingsDialog.aiService.deleteProfile}
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {isEditing && draft ? (
        <>
          <SettingsField title={copy.settingsDialog.aiService.nameField} description={copy.settingsDialog.aiService.nameFieldDescription}>
            <SettingsTextInput value={draft.name} autoComplete="off" onChange={(name) => setDraft({ ...draft, name })} />
          </SettingsField>
          <SettingsField title={copy.settingsDialog.subtitles.translationBaseUrl} description={copy.settingsDialog.subtitles.translationBaseUrlDescription}>
            <SettingsTextInput value={draft.baseUrl} autoComplete="off" onChange={(baseUrl) => setDraft({ ...draft, baseUrl })} />
          </SettingsField>
          <SettingsField title={copy.settingsDialog.subtitles.translationModel} description={copy.settingsDialog.subtitles.translationModelDescription}>
            <SettingsTextInput value={draft.model} autoComplete="off" onChange={(model) => setDraft({ ...draft, model })} />
          </SettingsField>
          <SettingsField title={copy.settingsDialog.subtitles.translationApiKey} description={copy.settingsDialog.subtitles.translationApiKeyDescription}>
            <SettingsTextInput type="password" value={draft.apiKey} autoComplete="new-password" onChange={(apiKey) => setDraft({ ...draft, apiKey })} />
          </SettingsField>
          <SettingsField title={copy.settingsDialog.subtitles.translationServiceCheckTitle} description={copy.settingsDialog.subtitles.translationServiceCheckDescription}>
            <div className="settings-inline-row">
              <button className="settings-secondary-button" type="button" onClick={testDraftProvider} disabled={isTestingTranslationService}>
                <Sparkles size={14} />
                {isTestingTranslationService ? copy.settingsDialog.subtitles.translationServiceChecking : copy.settingsDialog.subtitles.translationServiceCheck}
              </button>
              <button className="settings-secondary-button" type="button" onClick={saveEditing}>{copy.settingsDialog.aiService.saveProfile}</button>
              <button className="settings-secondary-button" type="button" onClick={resetEditing}>{copy.settingsDialog.aiService.cancelEdit}</button>
            </div>
          </SettingsField>
        </>
      ) : null}
      {translationServiceTestMessage ? (
        <div className={`asr-result ${translationServiceTestMessage.success ? 'success' : 'failed'}`}>{translationServiceTestMessage.message}</div>
      ) : null}
      {translationServiceTestMessage ? (
        <div className="settings-note-box">
          <span className="settings-note-title">{copy.settingsDialog.subtitles.translationServiceResultTitle}</span>
          <div className="settings-meta-grid">
            <div className="settings-meta-item"><span>{copy.asrPanel.translationLanguagePair}</span><strong>{translationServiceSourceLanguageLabel} → {translationServiceTargetLanguageLabel}</strong></div>
            <div className="settings-meta-item"><span>{copy.asrPanel.translationModel}</span><strong>{translationServiceTestMessage.translationModel ?? '—'}</strong></div>
            <div className="settings-meta-item"><span>{copy.settingsDialog.subtitles.translationBaseUrl}</span><strong>{translationServiceEndpointSummary}</strong></div>
          </div>
          {translationServiceTestMessage.success && translationServiceTestMessage.sampleSourceText && translationServiceTestMessage.sampleTranslatedText ? (
            <>
              <span className="settings-note-title">{copy.settingsDialog.subtitles.translationServicePreviewTitle}</span>
              <p>{translationServiceTestMessage.sampleSourceText} → {translationServiceTestMessage.sampleTranslatedText}</p>
            </>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
