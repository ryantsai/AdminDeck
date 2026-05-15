import { useEffect, useState } from "react";
import { Bot, Save } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  AI_PROVIDER_DEFINITIONS,
  getAiProviderDefinition,
  normalizeAiProviderDraft,
  providerDefaultsFor,
  type AiProviderDefinition,
  type AiProviderSettingsField,
} from "../ai/providers";
import { SUPPORTED_LANGUAGES } from "../i18n/config";
import { AI_PROVIDER_SECRET_OWNER_ID } from "../lib/settings";
import { invokeCommand, isTauriRuntime } from "../lib/tauri";
import { useWorkspaceStore } from "../store";
import type {
  AiAssistantToolId,
  AiProviderKind,
  AiProviderSettings as AiProviderSettingsType,
  AiReasoningEffort,
  SearchProvider,
} from "../types";
import { SettingsSectionHeader, SettingsSummary } from "./shared";
import { ToggleSwitch } from "./ToggleSwitch";
import i18next from "../i18n/config";

function createStoredApiKeyMask() {
  const maskLength = 12 + Math.floor(Math.random() * 5);
  return "*".repeat(maskLength);
}

function formatProviderHost(baseUrl: string) {
  try {
    return new URL(baseUrl).host || i18next.t("settings.openAiCompatibleEndpoint");
  } catch {
    return i18next.t("settings.openAiCompatibleEndpoint");
  }
}

function formatAiProviderCapability(capability: string) {
  switch (capability) {
    case "toolCalling":
      return i18next.t("settings.capabilityToolCalling");
    case "mcpReady":
      return i18next.t("settings.capabilityMcpReady");
    case "localRuntime":
      return i18next.t("settings.capabilityLocalRuntime");
    case "openAiCompatible":
      return i18next.t("settings.capabilityOpenAiCompatible");
    case "sdkOAuth":
      return i18next.t("settings.capabilitySdkOAuth");
    default:
      return capability;
  }
}

function formatReasoningEffort(effort: AiReasoningEffort) {
  switch (effort) {
    case "default":
      return i18next.t("settings.providerDefault");
    case "low":
      return i18next.t("settings.low");
    case "medium":
      return i18next.t("settings.medium");
    case "high":
      return i18next.t("settings.high");
    case "max":
      return i18next.t("settings.max");
    default:
      return effort;
  }
}

function AiProviderSettingsFieldControl({
  apiKeyDraft,
  apiKeyStoredMask,
  definition,
  draft,
  field,
  hasApiKey,
  onApiKeyDraftChange,
  onDraftChange,
}: {
  apiKeyDraft: string;
  apiKeyStoredMask: string;
  definition: AiProviderDefinition;
  draft: AiProviderSettingsType;
  field: AiProviderSettingsField;
  hasApiKey: boolean;
  onApiKeyDraftChange: (value: string) => void;
  onDraftChange: (patch: Partial<AiProviderSettingsType>) => void;
}) {
  const { t } = useTranslation();
  const [isApiKeyInputFocused, setIsApiKeyInputFocused] = useState(false);
  const shouldShowStoredApiKeyMask =
    field === "apiKey" && hasApiKey && !isApiKeyInputFocused && apiKeyDraft.length === 0;

  switch (field) {
    case "baseUrl":
      return (
        <label>
          <span>{t("settings.endpoint")}</span>
          <input
            onChange={(event) => onDraftChange({ baseUrl: event.currentTarget.value })}
            readOnly={!definition.allowsCustomBaseUrl}
            value={draft.baseUrl}
          />
        </label>
      );
    case "model": {
      const modelOptionIds = new Set(definition.modelOptions.map((model) => model.id));
      const hasCustomModel = draft.model.trim().length > 0 && !modelOptionIds.has(draft.model);
      return (
        <>
          <label>
            <span>{t("settings.model")}</span>
            <select
              onChange={(event) => onDraftChange({ model: event.currentTarget.value })}
              value={draft.model}
            >
              {hasCustomModel ? <option value={draft.model}>{draft.model}</option> : null}
              {definition.modelOptions.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </select>
          </label>
          {definition.allowsCustomModel ? (
            <label>
              <span>{t("settings.customModelId")}</span>
              <input
                onChange={(event) => onDraftChange({ model: event.currentTarget.value })}
                value={draft.model}
              />
            </label>
          ) : null}
        </>
      );
    }
    case "reasoningEffort":
      return (
        <label>
          <span>{t("settings.reasoningEffort")}</span>
          <select
            onChange={(event) =>
              onDraftChange({ reasoningEffort: event.currentTarget.value as AiReasoningEffort })
            }
            value={draft.reasoningEffort}
          >
            {definition.reasoningEfforts.map((effort) => (
              <option key={effort} value={effort}>
                {formatReasoningEffort(effort)}
              </option>
            ))}
          </select>
        </label>
      );
    case "apiKey":
      return (
        <label>
          <span>{definition.apiKeyLabel}</span>
          <input
            autoComplete="off"
            disabled={!definition.requiresApiKey}
            onBlur={() => setIsApiKeyInputFocused(false)}
            onChange={(event) => onApiKeyDraftChange(event.currentTarget.value)}
            onFocus={() => setIsApiKeyInputFocused(true)}
            placeholder={definition.apiKeyLabel}
            type="password"
            value={shouldShowStoredApiKeyMask ? apiKeyStoredMask : apiKeyDraft}
          />
        </label>
      );
    default:
      return null;
  }
}

function AiOutputLanguageControl({
  draft,
  onDraftChange,
}: {
  draft: AiProviderSettingsType;
  onDraftChange: (patch: Partial<AiProviderSettingsType>) => void;
}) {
  const { t } = useTranslation();
  const datalistId = "ai-output-language-options";
  const languageNames = SUPPORTED_LANGUAGES.map((code) => t(`languages.${code}` as never));

  return (
    <label>
      <span>{t("settings.outputLanguage")}</span>
      <input
        list={datalistId}
        onChange={(event) => onDraftChange({ outputLanguage: event.currentTarget.value })}
        placeholder={t("settings.outputLanguageUiLanguage")}
        value={draft.outputLanguage}
      />
      <datalist id={datalistId}>
        {languageNames.map((name, index) => (
          <option key={SUPPORTED_LANGUAGES[index]} value={name} />
        ))}
      </datalist>
    </label>
  );
}

const AI_ASSISTANT_TOOL_IDS: AiAssistantToolId[] = [
  "currentTime",
  "webSearch",
  "webFetch",
  "appDataFileSearch",
  "appDataFileRead",
  "shellCommand",
  "dashboard",
  "connections",
  "sessions",
];

const SEARCH_PROVIDER_OPTIONS: { value: SearchProvider; labelKey: string }[] = [
  { value: "scraper", labelKey: "settings.searchProviderScraper" },
  { value: "brave", labelKey: "settings.searchProviderBrave" },
  { value: "tavily", labelKey: "settings.searchProviderTavily" },
  { value: "searxng", labelKey: "settings.searchProviderSearxng" },
];

const BRAVE_SEARCH_OWNER_ID = "brave-search";
const TAVILY_SEARCH_OWNER_ID = "tavily-search";

function SearchProviderControl({
  draft,
  searchApiKeyDraft,
  searchApiKeyStoredMask,
  hasSearchApiKey,
  onDraftChange,
  onSearchApiKeyDraftChange,
}: {
  draft: AiProviderSettingsType;
  searchApiKeyDraft: string;
  searchApiKeyStoredMask: string;
  hasSearchApiKey: boolean;
  onDraftChange: (patch: Partial<AiProviderSettingsType>) => void;
  onSearchApiKeyDraftChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const [isSearchApiKeyFocused, setIsSearchApiKeyFocused] = useState(false);
  const shouldShowStoredApiKeyMask =
    hasSearchApiKey && !isSearchApiKeyFocused && searchApiKeyDraft.length === 0;

  return (
    <div className="search-provider-subsection">
      <label>
        <span>{t("settings.searchProvider")}</span>
        <select
          onChange={(event) =>
            onDraftChange({
              searchProvider: event.currentTarget.value as SearchProvider,
            })
          }
          value={draft.searchProvider}
        >
          {SEARCH_PROVIDER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.labelKey)}
            </option>
          ))}
        </select>
      </label>
      {draft.searchProvider === "brave" ? (
        <label>
          <span>{t("settings.braveSearchApiKey")}</span>
          <input
            autoComplete="off"
            onBlur={() => setIsSearchApiKeyFocused(false)}
            onChange={(event) => onSearchApiKeyDraftChange(event.currentTarget.value)}
            onFocus={() => setIsSearchApiKeyFocused(true)}
            placeholder={t("settings.braveSearchApiKey")}
            type="password"
            value={shouldShowStoredApiKeyMask ? searchApiKeyStoredMask : searchApiKeyDraft}
          />
        </label>
      ) : draft.searchProvider === "tavily" ? (
        <label>
          <span>{t("settings.tavilySearchApiKey")}</span>
          <input
            autoComplete="off"
            onBlur={() => setIsSearchApiKeyFocused(false)}
            onChange={(event) => onSearchApiKeyDraftChange(event.currentTarget.value)}
            onFocus={() => setIsSearchApiKeyFocused(true)}
            placeholder={t("settings.tavilySearchApiKey")}
            type="password"
            value={shouldShowStoredApiKeyMask ? searchApiKeyStoredMask : searchApiKeyDraft}
          />
        </label>
      ) : draft.searchProvider === "searxng" ? (
        <label>
          <span>{t("settings.searxngUrl")}</span>
          <input
            onChange={(event) =>
              onDraftChange({ searxngUrl: event.currentTarget.value })
            }
            placeholder="https://searxng.example.com"
            value={draft.searxngUrl}
          />
        </label>
      ) : null}
    </div>
  );
}

function AiAssistantToolsControl({
  draft,
  searchApiKeyDraft,
  searchApiKeyStoredMask,
  hasSearchApiKey,
  onDraftChange,
  onSearchApiKeyDraftChange,
}: {
  draft: AiProviderSettingsType;
  searchApiKeyDraft: string;
  searchApiKeyStoredMask: string;
  hasSearchApiKey: boolean;
  onDraftChange: (patch: Partial<AiProviderSettingsType>) => void;
  onSearchApiKeyDraftChange: (value: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <fieldset className="settings-fieldset ai-tool-settings">
      <legend>{t("settings.aiToolsTitle")}</legend>
      <p className="settings-help-text">{t("settings.aiToolsDescription")}</p>
      <div className="settings-toggle-list">
        {AI_ASSISTANT_TOOL_IDS.map((toolId) => (
          <div key={toolId}>
            <label className="settings-toggle-row">
              <ToggleSwitch
                checked={Boolean(draft.tools?.[toolId])}
                onChange={(checked) =>
                  onDraftChange({
                    tools: {
                      ...draft.tools,
                      [toolId]: checked,
                    },
                  })
                }
              />
              <span>
                <strong>{t(`settings.aiTools.${toolId}.label`)}</strong>
                <small>{t(`settings.aiTools.${toolId}.description`)}</small>
              </span>
            </label>
            {toolId === "webSearch" && draft.tools?.webSearch ? (
              <SearchProviderControl
                draft={draft}
                hasSearchApiKey={hasSearchApiKey}
                onDraftChange={onDraftChange}
                onSearchApiKeyDraftChange={onSearchApiKeyDraftChange}
                searchApiKeyDraft={searchApiKeyDraft}
                searchApiKeyStoredMask={searchApiKeyStoredMask}
              />
            ) : null}
          </div>
        ))}
      </div>
      <p className="settings-help-text">{t("settings.aiToolsSafety")}</p>
    </fieldset>
  );
}

export function AiSettings() {
  const { t } = useTranslation();
  const aiProviderSettings = useWorkspaceStore((state) => state.aiProviderSettings);
  const aiProviderHasApiKey = useWorkspaceStore((state) => state.aiProviderHasApiKey);
  const setAiProviderSettings = useWorkspaceStore((state) => state.setAiProviderSettings);
  const setAiProviderHasApiKey = useWorkspaceStore((state) => state.setAiProviderHasApiKey);
  const showStatusBarNotice = useWorkspaceStore((state) => state.showStatusBarNotice);
  const [draft, setDraft] = useState(aiProviderSettings);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [apiKeyStoredMask, setApiKeyStoredMask] = useState(createStoredApiKeyMask);
  const [searchApiKeyDraft, setSearchApiKeyDraft] = useState("");
  const [searchApiKeyStoredMask, setSearchApiKeyStoredMask] = useState(createStoredApiKeyMask);
  const [hasSearchApiKey, setHasSearchApiKey] = useState(false);
  const hasChanges =
    JSON.stringify(draft) !== JSON.stringify(aiProviderSettings) ||
    apiKeyDraft.trim().length > 0 ||
    searchApiKeyDraft.trim().length > 0;
  const aiProviderDefinition = getAiProviderDefinition(draft.providerKind);

  useEffect(() => {
    setDraft(aiProviderSettings);
  }, [aiProviderSettings]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let disposed = false;
    const ownerId =
      draft.searchProvider === "brave"
        ? BRAVE_SEARCH_OWNER_ID
        : draft.searchProvider === "tavily"
          ? TAVILY_SEARCH_OWNER_ID
          : null;
    if (!ownerId) {
      setHasSearchApiKey(false);
      return;
    }
    void invokeCommand("secret_exists", {
      request: {
        kind:
          draft.searchProvider === "brave"
            ? ("braveSearchApiKey" as const)
            : ("tavilySearchApiKey" as const),
        ownerId,
      },
    }).then((presence) => {
      if (!disposed) setHasSearchApiKey(presence.exists);
    });
    return () => {
      disposed = true;
    };
  }, [draft.searchProvider]);

  async function handleSave() {
    try {
      const nextSettings = normalizeAiProviderDraft(draft);

      if (apiKeyDraft.trim()) {
        if (isTauriRuntime()) {
          await invokeCommand("store_secret", {
            request: {
              kind: "aiApiKey",
              ownerId: AI_PROVIDER_SECRET_OWNER_ID,
              secret: apiKeyDraft.trim(),
            },
          });
        }
        setAiProviderHasApiKey(true);
        setApiKeyDraft("");
        setApiKeyStoredMask(createStoredApiKeyMask());
      }

      if (searchApiKeyDraft.trim()) {
        const isBrave = nextSettings.searchProvider === "brave";
        const isTavily = nextSettings.searchProvider === "tavily";
        if ((isBrave || isTavily) && isTauriRuntime()) {
          await invokeCommand("store_secret", {
            request: {
              kind: isBrave ? ("braveSearchApiKey" as const) : ("tavilySearchApiKey" as const),
              ownerId: isBrave ? BRAVE_SEARCH_OWNER_ID : TAVILY_SEARCH_OWNER_ID,
              secret: searchApiKeyDraft.trim(),
            },
          });
          setHasSearchApiKey(true);
          setSearchApiKeyDraft("");
          setSearchApiKeyStoredMask(createStoredApiKeyMask());
        }
      }

      const saved = isTauriRuntime()
        ? await invokeCommand("update_ai_provider_settings", { request: nextSettings })
        : nextSettings;
      setAiProviderSettings(saved);
      setDraft(saved);
      showStatusBarNotice(t("settings.aiProviderSaved"), { tone: "success" });
    } catch (err) {
      showStatusBarNotice(err instanceof Error ? err.message : String(err), { tone: "error" });
    }
  }

  function handleAiProviderKindChange(providerKind: AiProviderKind) {
    const defaults = providerDefaultsFor(providerKind);
    setDraft((settings) => ({
      ...settings,
      providerKind,
      baseUrl: defaults.baseUrl,
      model: defaults.model,
      reasoningEffort: defaults.reasoningEffort,
    }));
    setApiKeyDraft("");
  }

  return (
    <section className="settings-card settings-section">
      <SettingsSectionHeader
        actions={
          <button
            className="toolbar-button"
            disabled={!hasChanges}
            onClick={() => void handleSave()}
            type="button"
          >
            <Save size={15} />
            {t("settings.save")}
          </button>
        }
        icon={<Bot size={18} />}
        label={t("settings.sectionAiAssistant")}
        title={t("settings.aiProvider")}
      />

      <fieldset className="settings-subsection settings-fieldset">
        <legend>{t("settings.aiProviderConnection")}</legend>
        <div>
          <p className="field-hint">{t("settings.aiProviderConnectionHint")}</p>
        </div>
        <div className="form-grid ai-provider-selector-grid">
          <label>
            <span>{t("settings.provider")}</span>
            <select
              onChange={(event) =>
                handleAiProviderKindChange(event.currentTarget.value as AiProviderKind)
              }
              value={draft.providerKind}
            >
              {AI_PROVIDER_DEFINITIONS.map((definition) => (
                <option key={definition.kind} value={definition.kind}>
                  {definition.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="ai-provider-fields">
          {aiProviderDefinition.settingsFields.map((field) => (
            <AiProviderSettingsFieldControl
              apiKeyDraft={apiKeyDraft}
              apiKeyStoredMask={apiKeyStoredMask}
              definition={aiProviderDefinition}
              draft={draft}
              field={field}
              hasApiKey={aiProviderHasApiKey}
              key={field}
              onApiKeyDraftChange={setApiKeyDraft}
              onDraftChange={(patch) =>
                setDraft((settings) => ({
                  ...settings,
                  ...patch,
                }))
              }
            />
          ))}
        </div>
        <div className="settings-toggle-list">
          <label className="settings-toggle-row">
            <ToggleSwitch
              checked={draft.allowInsecureTls}
              onChange={(checked) =>
                setDraft((settings) => ({
                  ...settings,
                  allowInsecureTls: checked,
                }))
              }
            />
            <span>
              <strong>{t("settings.aiAllowInsecureTls")}</strong>
              <small>{t("settings.aiAllowInsecureTlsHint")}</small>
            </span>
          </label>
        </div>
      </fieldset>

      <fieldset className="settings-subsection settings-fieldset">
        <legend>{t("settings.aiResponseDefaults")}</legend>
        <div>
          <p className="field-hint">{t("settings.aiResponseDefaultsHint")}</p>
        </div>
        <div className="ai-provider-fields">
          <AiOutputLanguageControl
            draft={draft}
            onDraftChange={(patch) =>
              setDraft((settings) => ({
                ...settings,
                ...patch,
              }))
            }
          />
        </div>
      </fieldset>

      <AiAssistantToolsControl
        draft={draft}
        hasSearchApiKey={hasSearchApiKey}
        onDraftChange={(patch) =>
          setDraft((settings) => ({
            ...settings,
            ...patch,
          }))
        }
        onSearchApiKeyDraftChange={setSearchApiKeyDraft}
        searchApiKeyDraft={searchApiKeyDraft}
        searchApiKeyStoredMask={searchApiKeyStoredMask}
      />

      <div className="settings-summary-grid compact">
        <SettingsSummary label={t("settings.activeEndpoint")} value={formatProviderHost(draft.baseUrl)} />
        <SettingsSummary
          label={t("settings.capabilities")}
          value={aiProviderDefinition.capabilities
            .map(formatAiProviderCapability)
            .join(", ")}
        />
        <SettingsSummary
          label={t("settings.reasoning")}
          value={formatReasoningEffort(draft.reasoningEffort)}
        />
      </div>
    </section>
  );
}
