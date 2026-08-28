import { CheckCircle2, CircleAlert, Info, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import {
  MANAGED_AI_PROVIDER_ID,
  MAX_AI_PROVIDER_PROFILES,
  createCustomAiProvider,
  isAiProviderConfigured,
  resolveActiveAiProvider,
  type AiProviderProfile
} from '../../../../shared/ai-providers'
import { SettingsField } from '../settings-controls'
import { SettingsTextInput } from '../settings-inputs'
import { useModalFocusTrap } from '../use-modal-focus-trap'
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
  if (provider.kind === 'managed') return copy.settingsDialog.aiService.managedStatus
  return isAiProviderConfigured(provider)
    ? copy.settingsDialog.aiService.configuredBadge
    : copy.settingsDialog.aiService.incompleteBadge
}

function getProviderConfigurationLabel(copy: SettingsSectionProps['copy'], provider: AiProviderProfile): string {
  if (provider.kind === 'managed') return copy.settingsDialog.aiService.managedSummary
  return provider.model || copy.settingsDialog.aiService.incompleteBadge
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
  const providerDialogRef = useRef<HTMLElement | null>(null)

  const activeProvider = resolveActiveAiProvider(settings.ai.providers, settings.ai.activeProviderId)
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

  useModalFocusTrap(isEditing, providerDialogRef, '[data-testid="ai-service-provider-name"]')

  useEffect(() => {
    if (!isEditing) return

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        resetEditing()
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [isEditing])

  const selectProvider = (activeProviderId: string): void => {
    patchSettingsSection('ai', { activeProviderId })
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

  const translationServiceResult = translationServiceTestMessage ? (
    <section className="ai-service-test-result" aria-live="polite" aria-labelledby="ai-service-result-title">
      <div className="ai-service-test-result-heading" id="ai-service-result-title"><Sparkles size={14} />{copy.settingsDialog.subtitles.translationServiceResultTitle}</div>
      <div className={`asr-result ${translationServiceTestMessage.success ? 'success' : 'failed'}`}>{translationServiceTestMessage.message}</div>
      <div className="settings-meta-grid">
        <div className="settings-meta-item"><span>{copy.asrPanel.translationLanguagePair}</span><strong>{translationServiceSourceLanguageLabel} → {translationServiceTargetLanguageLabel}</strong></div>
        <div className="settings-meta-item"><span>{copy.asrPanel.translationModel}</span><strong>{translationServiceTestMessage.translationModel ?? '—'}</strong></div>
        <div className="settings-meta-item"><span>{copy.settingsDialog.subtitles.translationBaseUrl}</span><strong>{translationServiceEndpointSummary}</strong></div>
      </div>
      {translationServiceTestMessage.success && translationServiceTestMessage.sampleSourceText && translationServiceTestMessage.sampleTranslatedText ? <p className="ai-service-result-preview"><strong>{copy.settingsDialog.subtitles.translationServicePreviewTitle}</strong>{translationServiceTestMessage.sampleSourceText} → {translationServiceTestMessage.sampleTranslatedText}</p> : null}
    </section>
  ) : null

  return (
    <>
      <div className="ai-service-page-intro">
        <div className="ai-service-page-intro-heading">
          <Sparkles size={16} />
          <h2>{copy.settingsDialog.aiService.title}</h2>
        </div>
        <p>{copy.settingsDialog.aiService.introDescription}</p>
      </div>

      <section className="settings-card settings-card-wide ai-service-management-card" aria-labelledby="ai-service-management-title">
        <div className="ai-service-management-header">
          <div>
            <div className="settings-card-heading" id="ai-service-management-title"><Pencil size={15} />{copy.settingsDialog.aiService.managementTitle}</div>
            <p className="settings-card-note">{copy.settingsDialog.aiService.managementDescription}</p>
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

        <div className="ai-service-current-strip" aria-label={copy.settingsDialog.aiService.activeProvider}>
          <div className="ai-service-current-strip-copy">
            <span>{copy.settingsDialog.aiService.activeProvider}</span>
            <strong>{getProviderDisplayName(copy, activeProvider)}</strong>
            <small>{getProviderStatusLabel(copy, activeProvider)}{activeProvider.model ? ` · ${activeProvider.model}` : ''}</small>
          </div>
          <span className="ai-service-active-label">{copy.settingsDialog.aiService.activeBadge}</span>
        </div>

        <div className="ai-service-table" role="table" aria-label={copy.settingsDialog.aiService.tableLabel}>
          <div className="ai-service-table-row ai-service-table-header" role="row">
            <span role="columnheader">{copy.settingsDialog.aiService.serviceColumn}</span>
            <span role="columnheader">{copy.settingsDialog.aiService.configurationColumn}</span>
            <span role="columnheader">{copy.settingsDialog.aiService.statusColumn}</span>
            <span role="columnheader">{copy.settingsDialog.aiService.actionsColumn}</span>
          </div>
          {settings.ai.providers.map((provider) => {
            const isActive = provider.id === activeProvider.id
            const configurationLabel = getProviderConfigurationLabel(copy, provider)
            const endpointLabel = provider.kind === 'custom' ? provider.baseUrl ?? copy.settingsDialog.aiService.incompleteBadge : null

            return (
              <div className={`ai-service-table-row ${isActive ? 'is-active' : ''}`} data-ai-provider-id={provider.id} key={provider.id} role="row">
                <div className="ai-service-table-service" role="cell">
                  <span className="ai-service-table-icon" aria-hidden="true">{isActive ? <CheckCircle2 size={15} /> : <Sparkles size={15} />}</span>
                  <span className="ai-service-table-copy">
                    <strong>{getProviderDisplayName(copy, provider)}</strong>
                    <small>{provider.kind === 'managed' ? copy.settingsDialog.aiService.managedBadge : copy.settingsDialog.aiService.customBadge}</small>
                  </span>
                </div>
                <div className="ai-service-table-configuration" role="cell">
                  <strong title={configurationLabel}>{configurationLabel}</strong>
                  {endpointLabel ? <small title={endpointLabel}>{endpointLabel}</small> : null}
                </div>
                <div className="ai-service-table-status" role="cell">
                  <span className={`ai-service-status ${isActive ? 'is-active' : ''} ${provider.kind === 'managed' || isAiProviderConfigured(provider) ? 'is-ready' : 'is-incomplete'}`}>
                    {isActive || provider.kind === 'managed' ? <CheckCircle2 size={14} /> : <CircleAlert size={14} />}
                    {isActive ? copy.settingsDialog.aiService.activeBadge : getProviderStatusLabel(copy, provider)}
                  </span>
                </div>
                <div className="ai-service-table-actions" role="cell">
                  {isActive ? null : <button className="settings-secondary-button" type="button" onClick={() => selectProvider(provider.id)} disabled={isEditing}>{copy.settingsDialog.aiService.useProfile}</button>}
                  {provider.kind === 'custom' ? (
                    <>
                      <button className="settings-secondary-button" type="button" onClick={() => startEditing(provider)} disabled={isEditing} title={copy.settingsDialog.aiService.editProfile}>
                        <Pencil size={14} />
                        <span>{copy.settingsDialog.aiService.editProfile}</span>
                      </button>
                      <button className="settings-secondary-button ai-service-delete-button" type="button" onClick={() => deleteProvider(provider.id)} disabled={isEditing} title={copy.settingsDialog.aiService.deleteProfile}>
                        <Trash2 size={14} />
                        <span>{copy.settingsDialog.aiService.deleteProfile}</span>
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>

        {activeProvider.kind === 'managed' ? (
          <details className="ai-service-managed-details">
            <summary><Info size={14} /><strong>{copy.settingsDialog.subtitles.translationServiceManagedTitle}</strong></summary>
            <p>{copy.settingsDialog.subtitles.translationServiceManagedDescription}</p>
          </details>
        ) : (
          <p className="ai-service-custom-hint"><CircleAlert size={14} />{copy.settingsDialog.aiService.customProviderDescription}</p>
        )}

        {!isEditing ? translationServiceResult : null}
      </section>

      {isEditing && draft ? (
        <div className="modal-backdrop ai-service-provider-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && resetEditing()}>
          <section
            ref={providerDialogRef}
            className="ai-service-provider-dialog"
            data-ai-service-provider-dialog
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-service-provider-dialog-title"
            aria-describedby="ai-service-provider-dialog-description"
          >
            <div className="ai-service-provider-dialog-header">
              <div>
                <h2 id="ai-service-provider-dialog-title">{editingMode === 'new' ? copy.settingsDialog.aiService.newProfileTitle : copy.settingsDialog.aiService.editProfileTitle}</h2>
                <p id="ai-service-provider-dialog-description">{editingMode === 'new' ? copy.settingsDialog.aiService.newProfileDescription : copy.settingsDialog.aiService.editProfileDescription}</p>
              </div>
              <button className="mini-tool-button" type="button" onClick={resetEditing} title={copy.topbar.closeSettings}>
                <X size={14} />
              </button>
            </div>

            <div className="ai-service-provider-protocol">
              <Sparkles size={16} />
              <span><strong>{copy.settingsDialog.aiService.protocolTitle}</strong><small>{copy.settingsDialog.aiService.protocolDescription}</small></span>
            </div>

            <div className="ai-service-provider-fields">
              <SettingsField wide title={copy.settingsDialog.aiService.nameField} description={copy.settingsDialog.aiService.nameFieldDescription}>
                <SettingsTextInput dataTestId="ai-service-provider-name" value={draft.name} placeholder={copy.settingsDialog.aiService.namePlaceholder} autoComplete="off" onChange={(name) => setDraft({ ...draft, name })} />
              </SettingsField>
              <SettingsField wide title={copy.settingsDialog.subtitles.translationBaseUrl} description={copy.settingsDialog.subtitles.translationBaseUrlDescription}>
                <SettingsTextInput dataTestId="ai-service-provider-base-url" value={draft.baseUrl} placeholder={copy.settingsDialog.aiService.baseUrlPlaceholder} autoComplete="off" onChange={(baseUrl) => setDraft({ ...draft, baseUrl })} />
              </SettingsField>
              <SettingsField title={copy.settingsDialog.subtitles.translationModel} description={copy.settingsDialog.subtitles.translationModelDescription}>
                <SettingsTextInput dataTestId="ai-service-provider-model" value={draft.model} placeholder={copy.settingsDialog.aiService.modelPlaceholder} autoComplete="off" onChange={(model) => setDraft({ ...draft, model })} />
              </SettingsField>
              <SettingsField title={copy.settingsDialog.subtitles.translationApiKey} description={copy.settingsDialog.subtitles.translationApiKeyDescription}>
                <SettingsTextInput dataTestId="ai-service-provider-api-key" type="password" value={draft.apiKey} placeholder={copy.settingsDialog.aiService.apiKeyPlaceholder} autoComplete="new-password" onChange={(apiKey) => setDraft({ ...draft, apiKey })} />
              </SettingsField>
            </div>

            {translationServiceResult}

            <div className="ai-service-provider-dialog-footer">
              <div className="ai-service-provider-security-note">
                <Info size={14} />
                <span>
                  <strong>{copy.settingsDialog.subtitles.translationServiceCheckTitle}</strong>
                  <small>{copy.settingsDialog.subtitles.translationServiceCheckDescription}</small>
                </span>
              </div>
              <div className="ai-service-provider-actions">
                <button className="settings-secondary-button" type="button" onClick={testDraftProvider} disabled={isTestingTranslationService}>
                  <Sparkles size={14} />
                  {isTestingTranslationService ? copy.settingsDialog.subtitles.translationServiceChecking : copy.settingsDialog.subtitles.translationServiceCheck}
                </button>
                <button className="settings-secondary-button" type="button" onClick={resetEditing}>{copy.settingsDialog.aiService.cancelEdit}</button>
                <button className="asr-action-button primary" type="button" onClick={saveEditing}>{copy.settingsDialog.aiService.saveProfile}</button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}
