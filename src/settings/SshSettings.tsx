import { type FormEvent, useEffect, useRef, useState } from "react";
import { FolderOpen, KeyRound, Save, Server } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { invokeCommand, isTauriRuntime, selectKeyFile } from "../lib/tauri";
import { useWorkspaceStore } from "../store";
import type { SshSettings as SshSettingsType } from "../types";
import { SettingsSectionHeader } from "./shared";
import { ToggleSwitch } from "./ToggleSwitch";

function normalizeSshSettingsDraft(settings: SshSettingsType, t: TFunction): SshSettingsType {
  const defaultUser = settings.defaultUser.trim();
  const defaultKeyPath = settings.defaultKeyPath?.trim() || undefined;
  const defaultProxyJump = settings.defaultProxyJump?.trim() || undefined;
  const defaultPort = Math.round(settings.defaultPort);
  const bufferLines = Math.round(settings.bufferLines ?? 5000);

  if (!defaultUser) {
    throw new Error(t("settings.defaultSshUserRequired"));
  }
  if (!Number.isFinite(defaultPort) || defaultPort < 1 || defaultPort > 65535) {
    throw new Error(t("settings.defaultSshPortRange"));
  }
  if (!Number.isFinite(bufferLines) || bufferLines < 100 || bufferLines > 100_000) {
    throw new Error(t("settings.sshBufferRange"));
  }

  return {
    defaultUser,
    defaultPort,
    defaultKeyPath,
    defaultProxyJump,
    bufferLines,
    hideCommonPortRedirects: settings.hideCommonPortRedirects ?? true,
    allowOsc52Clipboard: settings.allowOsc52Clipboard ?? true,
  };
}

export function SshSettings() {
  const { t } = useTranslation();
  const sshSettings = useWorkspaceStore((state) => state.sshSettings);
  const setSshSettings = useWorkspaceStore((state) => state.setSshSettings);
  const showStatusBarNotice = useWorkspaceStore((state) => state.showStatusBarNotice);
  const [sshDraft, setSshDraft] = useState(sshSettings);
  const [keyEmailDialogOpen, setKeyEmailDialogOpen] = useState(false);
  const [keyEmailDraft, setKeyEmailDraft] = useState("");
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);
  const [error, setError] = useState("");
  const hasChanges = JSON.stringify(sshDraft) !== JSON.stringify(sshSettings);

  useEffect(() => {
    setSshDraft(sshSettings);
  }, [sshSettings]);

  async function handleBrowseKeyFile() {
    try {
      const selectedPath = await selectKeyFile(sshDraft.defaultKeyPath);
      if (!selectedPath) {
        return;
      }
      setSshDraft((settings) => ({
        ...settings,
        defaultKeyPath: selectedPath,
      }));
    } catch (browseError) {
      showStatusBarNotice(browseError instanceof Error ? browseError.message : String(browseError), { tone: "error" });
    }
  }

  function handleOpenKeyEmailDialog() {
    setError("");
    setKeyEmailDraft("");
    setKeyEmailDialogOpen(true);
  }

  async function handleGenerateKeyPair(emailInput: string) {
    const email = emailInput.trim();
    if (!email) {
      return;
    }
    try {
      setIsGeneratingKey(true);
      setError("");
      const generated = await invokeCommand("generate_ssh_key_pair", {
        request: { email },
      });
      const nextSettings = {
        ...sshDraft,
        defaultKeyPath: generated.privateKeyPath,
      };
      const normalized = normalizeSshSettingsDraft(nextSettings, t);
      const saved = isTauriRuntime()
        ? await invokeCommand("update_ssh_settings", { request: normalized })
        : normalized;
      setSshSettings(saved);
      setSshDraft(saved);
      showStatusBarNotice(
        t("settings.sshKeyGenerated", {
          privateKeyPath: generated.privateKeyPath,
          publicKeyPath: generated.publicKeyPath,
        }),
        { tone: "success" },
      );
      setKeyEmailDialogOpen(false);
      setKeyEmailDraft("");
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : String(generateError));
    } finally {
      setIsGeneratingKey(false);
    }
  }

  async function handleSave() {
    try {
      const nextSshSettings = normalizeSshSettingsDraft(sshDraft, t);
      const savedSshSettings = isTauriRuntime()
        ? await invokeCommand("update_ssh_settings", { request: nextSshSettings })
        : nextSshSettings;
      setSshSettings(savedSshSettings);
      setSshDraft(savedSshSettings);
      showStatusBarNotice(t("settings.sshDefaultsSaved"), { tone: "success" });
    } catch (saveError) {
      showStatusBarNotice(saveError instanceof Error ? saveError.message : String(saveError), { tone: "error" });
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
        icon={<Server size={18} />}
        label={t("settings.sectionSsh")}
        title={t("settings.sshDefaults")}
      />

      <fieldset className="settings-subsection settings-fieldset">
        <legend>{t("settings.sshConnectionDefaults")}</legend>
        <div>
          <p className="field-hint">{t("settings.sshConnectionDefaultsHint")}</p>
        </div>
        <div className="form-grid ssh-default-basic-grid">
          <label>
            <span>{t("settings.defaultUser")}</span>
            <input
              autoComplete="username"
              onChange={(event) => {
                const defaultUser = event.currentTarget.value;
                setSshDraft((settings) => ({
                  ...settings,
                  defaultUser,
                }));
              }}
              value={sshDraft.defaultUser}
            />
            <small className="field-hint">{t("settings.defaultSshUserHint")}</small>
          </label>
          <label>
            <span>{t("settings.defaultPort")}</span>
            <input
              inputMode="numeric"
              max={65535}
              min={1}
              onChange={(event) => {
                const defaultPort = Number(event.currentTarget.value);
                setSshDraft((settings) => ({
                  ...settings,
                  defaultPort,
                }));
              }}
              type="number"
              value={sshDraft.defaultPort}
            />
            <small className="field-hint">{t("settings.defaultSshPortHint")}</small>
          </label>
          <label>
            <span>{t("settings.proxyJump")}</span>
            <input
              onChange={(event) => {
                const defaultProxyJump = event.currentTarget.value;
                setSshDraft((settings) => ({
                  ...settings,
                  defaultProxyJump,
                }));
              }}
              placeholder={t("settings.proxyJumpPlaceholder")}
              value={sshDraft.defaultProxyJump ?? ""}
            />
            <small className="field-hint">{t("settings.proxyJumpHint")}</small>
          </label>
        </div>
      </fieldset>

      <fieldset className="settings-subsection settings-fieldset">
        <legend>{t("settings.sshAuthentication")}</legend>
        <div>
          <p className="field-hint">{t("settings.sshAuthenticationHint")}</p>
        </div>
        <div className="form-grid ssh-default-path-grid">
          <label className="ssh-key-path-setting">
            <span>{t("settings.defaultKey")}</span>
            <div className="input-with-button ssh-key-input-actions">
              <input
                onChange={(event) => {
                  const defaultKeyPath = event.currentTarget.value;
                  setSshDraft((settings) => ({
                    ...settings,
                    defaultKeyPath,
                  }));
                }}
                placeholder={t("settings.defaultKeyPlaceholder")}
                value={sshDraft.defaultKeyPath ?? ""}
              />
              <button
                className="toolbar-button"
                onClick={() => void handleBrowseKeyFile()}
                type="button"
              >
                <FolderOpen size={15} />
                {t("connections.browse")}
              </button>
              <button
                className="toolbar-button"
                onClick={handleOpenKeyEmailDialog}
                type="button"
              >
                <KeyRound size={15} />
                {t("settings.generateSshKey")}
              </button>
            </div>
            <small className="field-hint">{t("settings.defaultKeyHint")}</small>
          </label>
        </div>
      </fieldset>

      <fieldset className="settings-subsection settings-fieldset">
        <legend>{t("settings.sshTerminal")}</legend>
        <div>
          <p className="field-hint">{t("settings.sshTerminalHint")}</p>
        </div>
        <div className="form-grid ssh-default-basic-grid">
          <label>
            <span>{t("settings.sshBufferLines")}</span>
            <input
              inputMode="numeric"
              max={100000}
              min={100}
              onChange={(event) => {
                const bufferLines = Number(event.currentTarget.value);
                setSshDraft((settings) => ({
                  ...settings,
                  bufferLines,
                }));
              }}
              type="number"
              value={sshDraft.bufferLines}
            />
            <small className="field-hint">{t("settings.sshBufferHint")}</small>
          </label>
        </div>
        <div className="settings-toggle-list">
          <label className="settings-toggle-row">
            <ToggleSwitch
              checked={sshDraft.allowOsc52Clipboard ?? true}
              onChange={(checked) =>
                setSshDraft((settings) => ({ ...settings, allowOsc52Clipboard: checked }))
              }
            />
            <span>
              <strong>{t("settings.allowSshOsc52Clipboard")}</strong>
            </span>
          </label>
        </div>
      </fieldset>

      <fieldset className="settings-subsection settings-fieldset">
        <legend>{t("settings.portRedirect")}</legend>
        <div className="settings-section-title">
          <div>
            <p className="field-hint">{t("settings.portRedirectHint")}</p>
          </div>
        </div>
        <div className="settings-toggle-list">
          <label className="settings-toggle-row">
            <ToggleSwitch
              checked={sshDraft.hideCommonPortRedirects ?? true}
              onChange={(checked) =>
                setSshDraft((settings) => ({ ...settings, hideCommonPortRedirects: checked }))
              }
            />
            <span>
              <strong>{t("settings.hideCommonPortRedirects")}</strong>
              <small>{t("settings.hideCommonPortRedirectsHint")}</small>
            </span>
          </label>
        </div>
      </fieldset>

      {keyEmailDialogOpen ? (
        <SshKeyEmailDialog
          email={keyEmailDraft}
          error={error}
          isGenerating={isGeneratingKey}
          onCancel={() => {
            if (isGeneratingKey) {
              return;
            }
            setKeyEmailDialogOpen(false);
            setKeyEmailDraft("");
          }}
          onChange={setKeyEmailDraft}
          onSubmit={(email) => void handleGenerateKeyPair(email)}
        />
      ) : null}
    </section>
  );
}

function SshKeyEmailDialog({
  email,
  error,
  isGenerating,
  onCancel,
  onChange,
  onSubmit,
}: {
  email: string;
  error: string;
  isGenerating: boolean;
  onCancel: () => void;
  onChange: (email: string) => void;
  onSubmit: (email: string) => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const canSubmit = Boolean(email.trim()) && !isGenerating;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    onSubmit(email);
  }

  return (
    <div className="dialog-backdrop connection-dialog-backdrop" role="presentation">
      <form
        aria-label={t("settings.sshKeyEmailDialogTitle")}
        aria-modal="true"
        className="connection-dialog ssh-key-email-dialog"
        onSubmit={handleSubmit}
        role="dialog"
      >
        <header className="connection-dialog-header compact">
          <div>
            <p className="panel-label">{t("settings.sectionSsh")}</p>
            <h2>{t("settings.sshKeyEmailDialogTitle")}</h2>
          </div>
        </header>
        <p className="field-hint">{t("settings.sshKeyEmailDialogHint")}</p>
        {error ? <p className="form-error">{error}</p> : null}
        <label>
          <span>{t("settings.sshKeyEmailPrompt")}</span>
          <input
            autoComplete="email"
            onChange={(event) => onChange(event.currentTarget.value)}
            placeholder={t("settings.sshKeyEmailPlaceholder")}
            ref={inputRef}
            required
            type="email"
            value={email}
          />
        </label>
        <div className="dialog-actions">
          <button className="approve-button" disabled={!canSubmit} type="submit">
            <KeyRound size={15} />
            {isGenerating ? t("settings.sshKeyGenerating") : t("settings.generateSshKey")}
          </button>
          <button className="toolbar-button" disabled={isGenerating} onClick={onCancel} type="button">
            {t("common.cancel")}
          </button>
        </div>
      </form>
    </div>
  );
}
