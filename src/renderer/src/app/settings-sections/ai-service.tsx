import { CheckCircle2, CircleAlert, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { ReactElement } from 'react'
import {
  MANAGED_AI_PROVIDER_ID,
  MAX_AI_PROVIDER_PROFILES,
  createCustomAiProvider,
  isAiProviderConfigured,
  resolveActiveAiProvider,
  type AiProviderProfile
} from '../../../../shared/ai-providers'
import { SettingsField, SettingsSelect } from '../settings-controls'
import { SettingsTextInput } from '../settings-inputs'
import type { SettingsSectionProps } from '../settings-section-types'

type AiProviderDraft = { name: string; baseUrl: string; model: string; apiKey: string }
type AiProviderEditingMode = 'new' | 'edit'

function getProviderDisplayName(copy: SettingsSectionProps['copy'], provider: AiProviderProfile): string {
  if (provider.name) return provider.name
  return provider.kind === 'managed'
    ? copy.settingsDialog.aiService.managedProviderName
    : copy.settingsDialog.aiService.customProviderName
}

function getProviderStatusLabel(copy: SettingsSectionProps['copy'], provider: AiProviderProfile): string {
  if (provider.kind === 'managed') return copy.settingsDialog.aiService.managedSummary
  return isAiProviderConfigured(provider)
    ? copy.settingsDialog.aiService.configuredBadge
    : copy.settingsDialog.aiService.incompleteBadge
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
  const [editingMode, setEditingMode] = useState<AiProviderEditingMode | null>(null)
  const [draft, setDraft] = useState<AiProviderDraft | null>(null)

  const activeProvider = resolveActiveAiProvider(settings.ai.providers, settings.ai.activeProviderId)
  const providerOptions = settings.ai.providers.map((provider) => ({
    value: provider.id,
    label: getProviderDisplayName(copy, provider)
  }))
  const isEditing = editingProviderId !== null && editingMode !== null && draft !== null

  const startEditing = (provider: AiProviderProfile): void => {
    setEditingProviderId(provider.id)
    setEditingMode('edit')
    setDraft({ name: provider.name, baseUrl: provider.baseUrl ?? '', model: provider.model ?? '', apiKey: provider.apiKey ?? '' })
  }
  const startCreating = (): void => {
    const provider = createCustomAiProvider(`custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`)
    setEditingProviderId(provider.id)
    setEditingMode('new')
    setDraft({ name: '', baseUrl: '', model: '', apiKey: '' })
  }
  const resetEditing = (): void => {
    setEditingProviderId(null)
    setEditingMode(null)
    setDraft(null)
  }
  const saveEditing = (): void => {
    if (!editingProviderId || !draft) return
    patchSettingsSection('ai', (current) => ({
      ...current,
      providers: editingMode === 'new'
        ? [...current.providers, {
            id: editingProviderId,
            name: draft.name.trim(),
            kind: 'custom' as const,
            baseUrl: draft.baseUrl.trim() || null,
            model: draft.model.trim() || null,
            apiKey: draft.apiKey.trim() || null
          }]
        : current.providers.map((provider) =>
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
          ),
      activeProviderId: editingMode === 'new' ? editingProviderId : current.activeProviderId
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
      <div className="settings-note-box ai-service-intro">
        <div className="ai-service-intro-heading">
          <Sparkles size={15} />
          <span className="settings-note-title">{copy.settingsDialog.aiService.title}</span>
        </div>
        <p>{copy.settingsDialog.aiService.introDescription}</p>
      </div>
      <section className="settings-card settings-card-wide ai-service-current-card" aria-labelledby="ai-service-current-title">
        <div className="settings-card-heading" id="ai-service-current-title">
          <CheckCircle2 size={15} />
          {copy.settingsDialog.aiService.activeProvider}
        </div>
        <p className="settings-card-note">{copy.settingsDialog.aiService.currentProviderDescription}</p>
        <div className="ai-service-current-layout">
          <div className="ai-service-current-summary">
            <div className="ai-service-current-icon" aria-hidden="true"><Sparkles size={17} /></div>
            <div className="settings-field-copy">
              <strong>{getProviderDisplayName(copy, activeProvider)}</strong>
              <small>{getProviderStatusLabel(copy, activeProvider)}{activeProvider.model ? ` · ${activeProvider.model}` : ''}</small>
            </div>
          </div>
          <div className="ai-service-current-control">
            <span className="ai-service-control-label">{copy.settingsDialog.aiService.chooseProvider}</span>
            <SettingsSelect
              value={settings.ai.activeProviderId}
              options={providerOptions}
              onChange={(activeProviderId) => patchSettingsSection('ai', { activeProviderId })}
            />
          </div>
        </div>
        <div className={`ai-service-current-detail ${activeProvider.kind === 'managed' ? 'is-managed' : 'is-custom'}`}>
          {activeProvider.kind === 'managed' ? <CheckCircle2 size={14} /> : <CircleAlert size={14} />}
          <span>{activeProvider.kind === 'managed' ? copy.settingsDialog.subtitles.translationServiceManagedDescription : copy.settingsDialog.aiService.customProviderDescription}</span>
        </div>
      </section>
      <section className="settings-card settings-card-wide ai-service-profiles-card" aria-labelledby="ai-service-profiles-title">
        <div className="ai-service-section-header">
          <div>
            <div className="settings-card-heading" id="ai-service-profiles-title"><Pencil size={15} />{copy.settingsDialog.aiService.profileListTitle}</div>
            <p className="settings-card-note">{copy.settingsDialog.aiService.profileListDescription}</p>
          </div>
          <button
            className="asr-action-button primary ai-service-add-button"
            type="button"
            onClick={startCreating}
            disabled={isEditing || settings.ai.providers.length >= MAX_AI_PROVIDER_PROFILES}
          >
            <Plus size={14} />
            {copy.settingsDialog.aiService.addProfile}
          </button>
        </div>
        <div className="ai-service-profile-list">
          {settings.ai.providers.map((provider) => {
            const isActive = settings.ai.activeProviderId === provider.id
            return (
              <article className={`ai-service-profile-card ${isActive ? 'is-active' : ''}`} data-ai-provider-id={provider.id} key={provider.id}>
                <div className="ai-service-profile-main">
                  <div className="ai-service-profile-mark" aria-hidden="true">
                    {isActive ? <CheckCircle2 size={17} /> : <Sparkles size={16} />}
                  </div>
                  <div className="settings-field-copy">
                    <strong>{getProviderDisplayName(copy, provider)}</strong>
                    <small>{provider.kind === 'managed' ? copy.settingsDialog.aiService.managedBadge : copy.settingsDialog.aiService.customBadge} · {getProviderStatusLabel(copy, provider)}{provider.model ? ` · ${provider.model}` : ''}</small>
                  </div>
                </div>
                <div className="ai-service-profile-actions">
                  {isActive ? <span className="ai-service-active-label">{copy.settingsDialog.aiService.activeBadge}</span> : <button className="settings-secondary-button" type="button" onClick={() => patchSettingsSection('ai', { activeProviderId: provider.id })} disabled={isEditing}>{copy.settingsDialog.aiService.useProfile}</button>}
                  {provider.kind === 'custom' ? (
                    <>
                      <button className="settings-secondary-button" type="button" onClick={() => startEditing(provider)} disabled={isEditing}><Pencil size={14} />{copy.settingsDialog.aiService.editProfile}</button>
                      <button className="settings-secondary-button" type="button" onClick={() => deleteProvider(provider.id)} disabled={isEditing}><Trash2 size={14} />{copy.settingsDialog.aiService.deleteProfile}</button>
                    </>
                  ) : null}
                </div>
              </article>
            )
          })}
        </div>
      </section>
      {isEditing && draft ? (
        <section className="settings-card settings-card-wide ai-service-editor-card" data-ai-service-editor aria-labelledby="ai-service-editor-title">
          <div className="ai-service-section-header">
            <div>
              <div className="settings-card-heading" id="ai-service-editor-title"><Pencil size={15} />{editingMode === 'new' ? copy.settingsDialog.aiService.newProfileTitle : copy.settingsDialog.aiService.editProfileTitle}</div>
              <p className="settings-card-note">{editingMode === 'new' ? copy.settingsDialog.aiService.newProfileDescription : copy.settingsDialog.aiService.editProfileDescription}</p>
            </div>
            <span className="ai-service-editor-step">{copy.settingsDialog.aiService.editorStep}</span>
          </div>
          <div className="ai-service-editor-fields">
            <SettingsField wide title={copy.settingsDialog.aiService.nameField} description={copy.settingsDialog.aiService.nameFieldDescription}>
              <SettingsTextInput value={draft.name} placeholder={copy.settingsDialog.aiService.namePlaceholder} autoComplete="off" onChange={(name) => setDraft({ ...draft, name })} />
            </SettingsField>
            <SettingsField title={copy.settingsDialog.subtitles.translationBaseUrl} description={copy.settingsDialog.subtitles.translationBaseUrlDescription}>
              <SettingsTextInput value={draft.baseUrl} placeholder={copy.settingsDialog.aiService.baseUrlPlaceholder} autoComplete="off" onChange={(baseUrl) => setDraft({ ...draft, baseUrl })} />
            </SettingsField>
            <SettingsField title={copy.settingsDialog.subtitles.translationModel} description={copy.settingsDialog.subtitles.translationModelDescription}>
              <SettingsTextInput value={draft.model} placeholder={copy.settingsDialog.aiService.modelPlaceholder} autoComplete="off" onChange={(model) => setDraft({ ...draft, model })} />
            </SettingsField>
            <SettingsField wide title={copy.settingsDialog.subtitles.translationApiKey} description={copy.settingsDialog.subtitles.translationApiKeyDescription}>
              <SettingsTextInput type="password" value={draft.apiKey} placeholder={copy.settingsDialog.aiService.apiKeyPlaceholder} autoComplete="new-password" onChange={(apiKey) => setDraft({ ...draft, apiKey })} />
            </SettingsField>
          </div>
          <div className="ai-service-editor-footer">
            <div className="settings-field-copy">
              <strong>{copy.settingsDialog.subtitles.translationServiceCheckTitle}</strong>
              <small>{copy.settingsDialog.subtitles.translationServiceCheckDescription}</small>
            </div>
            <div className="ai-service-editor-actions">
              <button className="settings-secondary-button" type="button" onClick={testDraftProvider} disabled={isTestingTranslationService}>
                <Sparkles size={14} />
                {isTestingTranslationService ? copy.settingsDialog.subtitles.translationServiceChecking : copy.settingsDialog.subtitles.translationServiceCheck}
              </button>
              <button className="settings-secondary-button" type="button" onClick={resetEditing}>{copy.settingsDialog.aiService.cancelEdit}</button>
              <button className="asr-action-button primary" type="button" onClick={saveEditing}>{copy.settingsDialog.aiService.saveProfile}</button>
            </div>
          </div>
        </section>
      ) : null}
      {translationServiceTestMessage ? (
        <section className="settings-card settings-card-wide ai-service-result-card" aria-live="polite" aria-labelledby="ai-service-result-title">
          <div className="settings-card-heading" id="ai-service-result-title"><Sparkles size={15} />{copy.settingsDialog.subtitles.translationServiceResultTitle}</div>
          <div className={`asr-result ${translationServiceTestMessage.success ? 'success' : 'failed'}`}>{translationServiceTestMessage.message}</div>
          <div className="settings-meta-grid">
            <div className="settings-meta-item"><span>{copy.asrPanel.translationLanguagePair}</span><strong>{translationServiceSourceLanguageLabel} → {translationServiceTargetLanguageLabel}</strong></div>
            <div className="settings-meta-item"><span>{copy.asrPanel.translationModel}</span><strong>{translationServiceTestMessage.translationModel ?? '—'}</strong></div>
            <div className="settings-meta-item"><span>{copy.settingsDialog.subtitles.translationBaseUrl}</span><strong>{translationServiceEndpointSummary}</strong></div>
          </div>
          {translationServiceTestMessage.success && translationServiceTestMessage.sampleSourceText && translationServiceTestMessage.sampleTranslatedText ? <p className="ai-service-result-preview"><strong>{copy.settingsDialog.subtitles.translationServicePreviewTitle}</strong>{translationServiceTestMessage.sampleSourceText} → {translationServiceTestMessage.sampleTranslatedText}</p> : null}
        </section>
      ) : null}
    </>
  )
}
