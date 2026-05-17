import { useEffect, useState } from "react";
import { Bot, RefreshCw, Save } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  AI_PROVIDER_DEFINITIONS,
  CUSTOM_AI_INSTRUCTIONS_MAX_LENGTH,
  getAiProviderDefinition,
  normalizeAiProviderDraft,
  providerDefaultsFor,
  type AiProviderDefinition,
  type AiProviderSettingsField,
} from "../ai/providers";
import { SUPPORTED_LANGUAGES } from "../i18n/config";
import {
  EMAIL_API_SECRET_OWNER_ID,
  EMAIL_SMTP_SECRET_OWNER_ID,
  aiProviderSecretOwnerId,
} from "../lib/settings";
import {
  invokeCommand,
  isTauriRuntime,
  openExternalUrl,
  type AiProviderModelOption,
  type GitHubCopilotDeviceFlow,
} from "../lib/tauri";
import { useWorkspaceStore } from "../store";
import type {
  AiAssistantToolId,
  EmailProvider,
  AiProviderKind,
  AiProviderSettings as AiProviderSettingsType,
  AiReasoningEffort,
  SearchProvider,
  SmtpSecurity,
} from "../types";
import { sortModelOptionsForProvider } from "../ai/providerModelOptions";
import { McpServersControl } from "./McpServers";
import { SettingsSectionHeader } from "./shared";
import { ToggleSwitch } from "./ToggleSwitch";
import { shouldShowStoredAiProviderKeyMask } from "./aiProviderKeyField";
import i18next from "../i18n/config";

const GITHUB_COPILOT_CLI_INSTALL_URL =
  "https://docs.github.com/en/copilot/how-tos/copilot-cli/install-copilot-cli";

function createStoredApiKeyMask() {
  const maskLength = 12 + Math.floor(Math.random() * 5);
  return "*".repeat(maskLength);
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
  isRefreshingModels,
  modelOptions,
  onApiKeyDraftChange,
  onDraftChange,
  onRefreshModels,
}: {
  apiKeyDraft: string;
  apiKeyStoredMask: string;
  definition: AiProviderDefinition;
  draft: AiProviderSettingsType;
  field: AiProviderSettingsField;
  hasApiKey: boolean;
  isRefreshingModels: boolean;
  modelOptions?: AiProviderModelOption[];
  onApiKeyDraftChange: (value: string) => void;
  onDraftChange: (patch: Partial<AiProviderSettingsType>) => void;
  onRefreshModels: () => void;
}) {
  const { t } = useTranslation();
  const [isApiKeyInputFocused, setIsApiKeyInputFocused] = useState(false);
  const [modelSearchQuery, setModelSearchQuery] = useState("");
  const shouldShowStoredApiKeyMask =
    field === "apiKey" &&
    shouldShowStoredAiProviderKeyMask({
      apiKeyDraft,
      hasProviderApiKey: hasApiKey,
      isInputFocused: isApiKeyInputFocused,
    });

  useEffect(() => {
    setModelSearchQuery("");
  }, [definition.kind]);

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
      const options = sortModelOptionsForProvider(
        definition.kind,
        modelOptions ?? definition.modelOptions,
      );
      const normalizedModelSearchQuery = modelSearchQuery.trim().toLowerCase();
      const filteredOptions = normalizedModelSearchQuery
        ? options.filter((model) => {
            const label = model.label.toLowerCase();
            const id = model.id.toLowerCase();
            return (
              label.includes(normalizedModelSearchQuery) ||
              id.includes(normalizedModelSearchQuery)
            );
          })
        : options;
      const modelOptionIds = new Set(options.map((model) => model.id));
      const selectedModelOption = options.find((model) => model.id === draft.model);
      const selectedModelOptionIsFilteredOut = Boolean(
        selectedModelOption &&
          !filteredOptions.some((model) => model.id === selectedModelOption.id),
      );
      const hasCustomModel = draft.model.trim().length > 0 && !modelOptionIds.has(draft.model);
      return (
        <>
          <label>
            <span>
              {t("settings.model")}
              {definition.modelListStrategy ? (
                <button
                  className="settings-api-key-link"
                  disabled={
                    isRefreshingModels ||
                    !isTauriRuntime() ||
                    (definition.requiresApiKey && !hasApiKey)
                  }
                  onClick={onRefreshModels}
                  type="button"
                >
                  <RefreshCw size={13} />
                  {isRefreshingModels
                    ? t("settings.refreshingModels")
                    : t("settings.refreshModels")}
                </button>
              ) : null}
            </span>
            <div className="ai-model-picker">
              <input
                aria-label={t("settings.searchModels")}
                className="ai-model-search-input"
                onChange={(event) => setModelSearchQuery(event.currentTarget.value)}
                placeholder={t("settings.searchModelsPlaceholder")}
                value={modelSearchQuery}
              />
              <select
                onChange={(event) => onDraftChange({ model: event.currentTarget.value })}
                value={draft.model}
              >
                {hasCustomModel ? <option value={draft.model}>{draft.model}</option> : null}
                {selectedModelOptionIsFilteredOut && selectedModelOption ? (
                  <option hidden value={selectedModelOption.id}>
                    {selectedModelOption.label}
                  </option>
                ) : null}
                {filteredOptions.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </select>
              {normalizedModelSearchQuery && filteredOptions.length === 0 ? (
                <small className="field-hint">{t("settings.noModelsMatchSearch")}</small>
              ) : null}
            </div>
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
          <span>
            {definition.apiKeyLabel}
            {definition.apiKeyUrl ? (
              <button
                className="settings-api-key-link"
                onClick={() => void openExternalUrl(definition.apiKeyUrl!)}
                type="button"
              >
                {t("settings.howToGetApiKey")}
              </button>
            ) : null}
          </span>
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

function AiCustomInstructionsControl({
  draft,
  onDraftChange,
}: {
  draft: AiProviderSettingsType;
  onDraftChange: (patch: Partial<AiProviderSettingsType>) => void;
}) {
  const { t } = useTranslation();

  return (
    <label>
      <span>{t("settings.aiCustomInstructions")}</span>
      <small className="field-hint">
        {t("settings.aiCustomInstructionsHint", {
          count: CUSTOM_AI_INSTRUCTIONS_MAX_LENGTH,
        })}
      </small>
      <textarea
        className="ai-custom-instructions-textarea"
        maxLength={CUSTOM_AI_INSTRUCTIONS_MAX_LENGTH}
        onChange={(event) =>
          onDraftChange({ customInstructions: event.currentTarget.value })
        }
        value={draft.customInstructions ?? ""}
      />
    </label>
  );
}

function GitHubCopilotConnectionControl({
  deviceFlow,
  hasApiKey,
  isPolling,
  onConnect,
  onDisconnect,
}: {
  deviceFlow: GitHubCopilotDeviceFlow | null;
  hasApiKey: boolean;
  isPolling: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="settings-copilot-connection">
      <p className="field-hint">
        {t("settings.copilotConnectionHint")}
        {" "}
        <button
          className="settings-api-key-link"
          onClick={() => void openExternalUrl(GITHUB_COPILOT_CLI_INSTALL_URL)}
          type="button"
        >
          {t("settings.copilotCliInstallHelp")}
        </button>
      </p>
      {deviceFlow ? (
        <div className="settings-copilot-code">
          <strong>{t("settings.copilotAuthCode", { code: deviceFlow.userCode })}</strong>
          <button
            className="settings-api-key-link"
            onClick={() => void openExternalUrl(deviceFlow.verificationUri)}
            type="button"
          >
            {t("settings.copilotOpenDevicePage")}
          </button>
          <small>{t("settings.copilotAuthPending")}</small>
        </div>
      ) : null}
      <div className="settings-copilot-actions">
        <button
          className="toolbar-button"
          disabled={isPolling || Boolean(deviceFlow) || hasApiKey || !isTauriRuntime()}
          onClick={onConnect}
          type="button"
        >
          {t("settings.copilotConnect")}
        </button>
        <button
          className="toolbar-button"
          disabled={isPolling || !hasApiKey || !isTauriRuntime()}
          onClick={onDisconnect}
          type="button"
        >
          {t("settings.copilotDisconnect")}
        </button>
      </div>
    </div>
  );
}

const AI_ASSISTANT_TOOL_IDS: AiAssistantToolId[] = [
  "currentTime",
  "webSearch",
  "webFetch",
  "appDataFileSearch",
  "appDataFileRead",
  "performanceCounters",
  "email",
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
const EMAIL_PROVIDER_OPTIONS: { value: EmailProvider; labelKey: string }[] = [
  { value: "resend", labelKey: "settings.emailProviderResend" },
  { value: "sendgrid", labelKey: "settings.emailProviderSendGrid" },
  { value: "mailgun", labelKey: "settings.emailProviderMailgun" },
  { value: "postmark", labelKey: "settings.emailProviderPostmark" },
  { value: "smtp", labelKey: "settings.emailProviderSmtp" },
];

const SMTP_SECURITY_OPTIONS: { value: SmtpSecurity; labelKey: string }[] = [
  { value: "starttls", labelKey: "settings.smtpSecurityStartTls" },
  { value: "none", labelKey: "settings.smtpSecurityNone" },
];

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

function EmailDeliveryControl({
  draft,
  emailSecretDraft,
  emailSecretStoredMask,
  hasEmailSecret,
  onDraftChange,
  onEmailSecretDraftChange,
}: {
  draft: AiProviderSettingsType;
  emailSecretDraft: string;
  emailSecretStoredMask: string;
  hasEmailSecret: boolean;
  onDraftChange: (patch: Partial<AiProviderSettingsType>) => void;
  onEmailSecretDraftChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const [isSecretFocused, setIsSecretFocused] = useState(false);
  const shouldShowStoredSecret =
    hasEmailSecret && !isSecretFocused && emailSecretDraft.length === 0;
  const secretLabel =
    draft.emailProvider === "smtp" ? t("settings.smtpPassword") : t("settings.emailApiKey");

  return (
    <div className="search-provider-subsection">
      <label>
        <span>{t("settings.emailProvider")}</span>
        <select
          onChange={(event) =>
            onDraftChange({
              emailProvider: event.currentTarget.value as EmailProvider,
            })
          }
          value={draft.emailProvider}
        >
          {EMAIL_PROVIDER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.labelKey)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>{t("settings.emailFrom")}</span>
        <input
          onChange={(event) => onDraftChange({ emailFrom: event.currentTarget.value })}
          placeholder="ops@example.com"
          value={draft.emailFrom}
        />
      </label>
      {draft.emailProvider === "mailgun" ? (
        <label>
          <span>{t("settings.mailgunDomain")}</span>
          <input
            onChange={(event) =>
              onDraftChange({ mailgunDomain: event.currentTarget.value })
            }
            placeholder="mg.example.com"
            value={draft.mailgunDomain}
          />
        </label>
      ) : null}
      {draft.emailProvider === "smtp" ? (
        <>
          <label>
            <span>{t("settings.smtpHost")}</span>
            <input
              onChange={(event) => onDraftChange({ smtpHost: event.currentTarget.value })}
              placeholder="smtp.example.com"
              value={draft.smtpHost}
            />
          </label>
          <label>
            <span>{t("settings.smtpPort")}</span>
            <input
              min={1}
              max={65535}
              onChange={(event) =>
                onDraftChange({ smtpPort: Number(event.currentTarget.value) })
              }
              type="number"
              value={draft.smtpPort}
            />
          </label>
          <label>
            <span>{t("settings.smtpSecurity")}</span>
            <select
              onChange={(event) =>
                onDraftChange({ smtpSecurity: event.currentTarget.value as SmtpSecurity })
              }
              value={draft.smtpSecurity}
            >
              {SMTP_SECURITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("settings.smtpUsername")}</span>
            <input
              onChange={(event) =>
                onDraftChange({ smtpUsername: event.currentTarget.value })
              }
              value={draft.smtpUsername}
            />
          </label>
        </>
      ) : null}
      <label>
        <span>{secretLabel}</span>
        <input
          autoComplete="off"
          onBlur={() => setIsSecretFocused(false)}
          onChange={(event) => onEmailSecretDraftChange(event.currentTarget.value)}
          onFocus={() => setIsSecretFocused(true)}
          placeholder={secretLabel}
          type="password"
          value={shouldShowStoredSecret ? emailSecretStoredMask : emailSecretDraft}
        />
      </label>
    </div>
  );
}

function AiAssistantToolsControl({
  draft,
  emailSecretDraft,
  emailSecretStoredMask,
  hasEmailSecret,
  searchApiKeyDraft,
  searchApiKeyStoredMask,
  hasSearchApiKey,
  onDraftChange,
  onEmailSecretDraftChange,
  onSearchApiKeyDraftChange,
}: {
  draft: AiProviderSettingsType;
  emailSecretDraft: string;
  emailSecretStoredMask: string;
  hasEmailSecret: boolean;
  searchApiKeyDraft: string;
  searchApiKeyStoredMask: string;
  hasSearchApiKey: boolean;
  onDraftChange: (patch: Partial<AiProviderSettingsType>) => void;
  onEmailSecretDraftChange: (value: string) => void;
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
            ) : toolId === "email" && draft.tools?.email ? (
              <EmailDeliveryControl
                draft={draft}
                emailSecretDraft={emailSecretDraft}
                emailSecretStoredMask={emailSecretStoredMask}
                hasEmailSecret={hasEmailSecret}
                onDraftChange={onDraftChange}
                onEmailSecretDraftChange={onEmailSecretDraftChange}
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
  const setAiProviderSettings = useWorkspaceStore((state) => state.setAiProviderSettings);
  const setAiProviderHasApiKey = useWorkspaceStore((state) => state.setAiProviderHasApiKey);
  const showStatusBarNotice = useWorkspaceStore((state) => state.showStatusBarNotice);
  const [draft, setDraft] = useState(aiProviderSettings);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [apiKeyStoredMask, setApiKeyStoredMask] = useState(createStoredApiKeyMask);
  const [selectedProviderHasApiKey, setSelectedProviderHasApiKey] = useState(false);
  const [searchApiKeyDraft, setSearchApiKeyDraft] = useState("");
  const [searchApiKeyStoredMask, setSearchApiKeyStoredMask] = useState(createStoredApiKeyMask);
  const [hasSearchApiKey, setHasSearchApiKey] = useState(false);
  const [emailSecretDraft, setEmailSecretDraft] = useState("");
  const [emailSecretStoredMask, setEmailSecretStoredMask] = useState(createStoredApiKeyMask);
  const [hasEmailSecret, setHasEmailSecret] = useState(false);
  const [copilotDeviceFlow, setCopilotDeviceFlow] =
    useState<GitHubCopilotDeviceFlow | null>(null);
  const [copilotPollIntervalSeconds, setCopilotPollIntervalSeconds] = useState(0);
  const [copilotPollTick, setCopilotPollTick] = useState(0);
  const [isCopilotPolling, setIsCopilotPolling] = useState(false);
  const [refreshedModelOptions, setRefreshedModelOptions] = useState<AiProviderModelOption[]>([]);
  const [isRefreshingModels, setIsRefreshingModels] = useState(false);
  const hasChanges =
    JSON.stringify(draft) !== JSON.stringify(aiProviderSettings) ||
    apiKeyDraft.trim().length > 0 ||
    searchApiKeyDraft.trim().length > 0 ||
    emailSecretDraft.trim().length > 0;
  const aiProviderDefinition = getAiProviderDefinition(draft.providerKind);

  useEffect(() => {
    setDraft(aiProviderSettings);
  }, [aiProviderSettings]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let disposed = false;
    setApiKeyDraft("");
    void invokeCommand("secret_exists", {
      request: {
        kind: "aiApiKey",
        ownerId: aiProviderSecretOwnerId(draft.providerKind),
      },
    })
      .then((presence) => {
        if (!disposed) setSelectedProviderHasApiKey(presence.exists);
      })
      .catch(() => {
        if (!disposed) setSelectedProviderHasApiKey(false);
      });
    return () => {
      disposed = true;
    };
  }, [draft.providerKind]);

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

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let disposed = false;
    setEmailSecretDraft("");
    const isSmtp = draft.emailProvider === "smtp";
    void invokeCommand("secret_exists", {
      request: {
        kind: isSmtp ? ("emailSmtpPassword" as const) : ("emailApiKey" as const),
        ownerId: isSmtp ? EMAIL_SMTP_SECRET_OWNER_ID : EMAIL_API_SECRET_OWNER_ID,
      },
    })
      .then((presence) => {
        if (!disposed) setHasEmailSecret(presence.exists);
      })
      .catch(() => {
        if (!disposed) setHasEmailSecret(false);
      });
    return () => {
      disposed = true;
    };
  }, [draft.emailProvider]);

  useEffect(() => {
    if (!copilotDeviceFlow || !isTauriRuntime()) return;
    let disposed = false;
    const delayMs = Math.max(1, copilotPollIntervalSeconds || copilotDeviceFlow.interval) * 1000;
    const timeoutId = window.setTimeout(() => {
      setIsCopilotPolling(true);
      void invokeCommand("poll_github_copilot_device_flow", {
        request: { deviceCode: copilotDeviceFlow.deviceCode },
      })
        .then((response) => {
          if (disposed) return;
          if (response.status === "authorized") {
            setCopilotDeviceFlow(null);
            setIsCopilotPolling(false);
            setSelectedProviderHasApiKey(true);
            if (draft.providerKind === "github-copilot") {
              setAiProviderHasApiKey(true);
            }
            showStatusBarNotice(t("settings.copilotConnected"), { tone: "success" });
            return;
          }
          const nextInterval =
            response.status === "slowDown"
              ? Math.max(1, copilotPollIntervalSeconds + (response.interval ?? 5))
              : Math.max(1, response.interval ?? copilotPollIntervalSeconds);
          setCopilotPollIntervalSeconds(nextInterval);
          setCopilotPollTick((tick) => tick + 1);
          setIsCopilotPolling(false);
        })
        .catch((error) => {
          if (disposed) return;
          setCopilotDeviceFlow(null);
          setIsCopilotPolling(false);
          showStatusBarNotice(error instanceof Error ? error.message : String(error), {
            tone: "error",
          });
        });
    }, delayMs);
    return () => {
      disposed = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    copilotDeviceFlow,
    copilotPollIntervalSeconds,
    copilotPollTick,
    draft.providerKind,
    setAiProviderHasApiKey,
    showStatusBarNotice,
    t,
  ]);

  useEffect(() => {
    if (
      !isTauriRuntime() ||
      !aiProviderDefinition.modelListStrategy ||
      (aiProviderDefinition.requiresApiKey && !selectedProviderHasApiKey)
    ) {
      setRefreshedModelOptions([]);
      setIsRefreshingModels(false);
      return;
    }

    let disposed = false;
    setIsRefreshingModels(true);
    void invokeCommand("list_ai_provider_models", {
      request: {
        providerKind: draft.providerKind,
        baseUrl: draft.baseUrl,
        allowInsecureTls: draft.allowInsecureTls,
      },
    })
      .then((models) => {
        if (disposed) return;
        const sortedModels = sortModelOptionsForProvider(draft.providerKind, models);
        setRefreshedModelOptions(sortedModels);
        setDraft((settings) => {
          if (
            settings.providerKind !== draft.providerKind ||
            sortedModels.length === 0 ||
            (settings.model.trim().length > 0 &&
              (!aiProviderDefinition.strictModelList ||
                sortedModels.some((model) => model.id === settings.model)))
          ) {
            return settings;
          }
          return { ...settings, model: sortedModels[0].id };
        });
      })
      .catch(() => {
        if (!disposed) setRefreshedModelOptions([]);
      })
      .finally(() => {
        if (!disposed) setIsRefreshingModels(false);
      });

    return () => {
      disposed = true;
    };
  }, [
    aiProviderDefinition.modelListStrategy,
    aiProviderDefinition.strictModelList,
    draft.allowInsecureTls,
    draft.baseUrl,
    draft.providerKind,
    selectedProviderHasApiKey,
  ]);

  async function handleRefreshModels() {
    if (
      !isTauriRuntime() ||
      !aiProviderDefinition.modelListStrategy ||
      (aiProviderDefinition.requiresApiKey && !selectedProviderHasApiKey)
    ) {
      return;
    }
    setIsRefreshingModels(true);
    try {
      const models = await invokeCommand("list_ai_provider_models", {
        request: {
          providerKind: draft.providerKind,
          baseUrl: draft.baseUrl,
          allowInsecureTls: draft.allowInsecureTls,
        },
      });
      const sortedModels = sortModelOptionsForProvider(draft.providerKind, models);
      setRefreshedModelOptions(sortedModels);
      setDraft((settings) => {
        if (
          settings.providerKind !== draft.providerKind ||
          sortedModels.length === 0 ||
          (settings.model.trim().length > 0 &&
            (!aiProviderDefinition.strictModelList ||
              sortedModels.some((model) => model.id === settings.model)))
        ) {
          return settings;
        }
        return { ...settings, model: sortedModels[0].id };
      });
      showStatusBarNotice(t("settings.modelListRefreshed"), { tone: "success" });
    } catch (error) {
      setRefreshedModelOptions([]);
      showStatusBarNotice(error instanceof Error ? error.message : String(error), {
        tone: "error",
      });
    } finally {
      setIsRefreshingModels(false);
    }
  }

  async function handleSave() {
    try {
      const nextSettings = normalizeAiProviderDraft(draft);

      if (apiKeyDraft.trim()) {
        if (isTauriRuntime()) {
          await invokeCommand("store_secret", {
            request: {
              kind: "aiApiKey",
              ownerId: aiProviderSecretOwnerId(nextSettings.providerKind),
              secret: apiKeyDraft.trim(),
            },
          });
        }
        setAiProviderHasApiKey(true);
        setSelectedProviderHasApiKey(true);
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

      if (emailSecretDraft.trim() && isTauriRuntime()) {
        const isSmtp = nextSettings.emailProvider === "smtp";
        await invokeCommand("store_secret", {
          request: {
            kind: isSmtp ? ("emailSmtpPassword" as const) : ("emailApiKey" as const),
            ownerId: isSmtp ? EMAIL_SMTP_SECRET_OWNER_ID : EMAIL_API_SECRET_OWNER_ID,
            secret: emailSecretDraft.trim(),
          },
        });
        setHasEmailSecret(true);
        setEmailSecretDraft("");
        setEmailSecretStoredMask(createStoredApiKeyMask());
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
    setSelectedProviderHasApiKey(false);
    setCopilotDeviceFlow(null);
    setCopilotPollIntervalSeconds(0);
    setCopilotPollTick(0);
    setRefreshedModelOptions([]);
  }

  async function handleConnectGitHubCopilot() {
    if (!isTauriRuntime()) return;
    try {
      const flow = await invokeCommand("start_github_copilot_device_flow", undefined);
      setCopilotDeviceFlow(flow);
      setCopilotPollIntervalSeconds(flow.interval);
      setCopilotPollTick(0);
      await openExternalUrl(flow.verificationUri);
    } catch (error) {
      setCopilotDeviceFlow(null);
      showStatusBarNotice(error instanceof Error ? error.message : String(error), {
        tone: "error",
      });
    }
  }

  async function handleDisconnectGitHubCopilot() {
    if (!isTauriRuntime()) return;
    try {
      await invokeCommand("delete_secret", {
        request: {
          kind: "aiApiKey",
          ownerId: aiProviderSecretOwnerId("github-copilot"),
        },
      });
      setCopilotDeviceFlow(null);
      setCopilotPollIntervalSeconds(0);
      setCopilotPollTick(0);
      setRefreshedModelOptions([]);
      setSelectedProviderHasApiKey(false);
      if (aiProviderSettings.providerKind === "github-copilot") {
        setAiProviderHasApiKey(false);
      }
      showStatusBarNotice(t("settings.copilotDisconnected"), { tone: "success" });
    } catch (error) {
      showStatusBarNotice(error instanceof Error ? error.message : String(error), {
        tone: "error",
      });
    }
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
        {draft.providerKind === "github-copilot" ? (
          <GitHubCopilotConnectionControl
            deviceFlow={copilotDeviceFlow}
            hasApiKey={selectedProviderHasApiKey}
            isPolling={isCopilotPolling}
            onConnect={() => void handleConnectGitHubCopilot()}
            onDisconnect={() => void handleDisconnectGitHubCopilot()}
          />
        ) : null}

        <div className="ai-provider-fields">
          {aiProviderDefinition.settingsFields.map((field) => (
            <AiProviderSettingsFieldControl
              apiKeyDraft={apiKeyDraft}
              apiKeyStoredMask={apiKeyStoredMask}
              definition={aiProviderDefinition}
              draft={draft}
              field={field}
              hasApiKey={selectedProviderHasApiKey}
              key={field}
              modelOptions={
                refreshedModelOptions.length > 0
                  ? refreshedModelOptions
                  : undefined
              }
              onApiKeyDraftChange={setApiKeyDraft}
              onDraftChange={(patch) =>
                setDraft((settings) => ({
                  ...settings,
                  ...patch,
                }))
              }
              isRefreshingModels={isRefreshingModels}
              onRefreshModels={() => void handleRefreshModels()}
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
          <AiCustomInstructionsControl
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
        emailSecretDraft={emailSecretDraft}
        emailSecretStoredMask={emailSecretStoredMask}
        hasEmailSecret={hasEmailSecret}
        hasSearchApiKey={hasSearchApiKey}
        onDraftChange={(patch) =>
          setDraft((settings) => ({
            ...settings,
            ...patch,
          }))
        }
        onEmailSecretDraftChange={setEmailSecretDraft}
        onSearchApiKeyDraftChange={setSearchApiKeyDraft}
        searchApiKeyDraft={searchApiKeyDraft}
        searchApiKeyStoredMask={searchApiKeyStoredMask}
      />

      <McpServersControl />

    </section>
  );
}
