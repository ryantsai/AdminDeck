import { useEffect, useState } from "react";
import { FolderOpen, Save } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { ConnectionIcon } from "../connections/ConnectionIcon";
import { invokeCommand, isTauriRuntime, selectKeyFile } from "../lib/tauri";
import { useWorkspaceStore } from "../store";
import type {
  SftpOverwriteBehavior,
  SftpSettings as SftpSettingsType,
  SshSettings as SshSettingsType,
} from "../types";

function normalizeSshSettingsDraft(settings: SshSettingsType, t: TFunction): SshSettingsType {
  const defaultUser = settings.defaultUser.trim();
  const defaultKeyPath = settings.defaultKeyPath?.trim() || undefined;
  const defaultProxyJump = settings.defaultProxyJump?.trim() || undefined;
  const defaultPort = Math.round(settings.defaultPort);

  if (!defaultUser) {
    throw new Error(t("settings.defaultSshUserRequired"));
  }
  if (!Number.isFinite(defaultPort) || defaultPort < 1 || defaultPort > 65535) {
    throw new Error(t("settings.defaultSshPortRange"));
  }

  return {
    defaultUser,
    defaultPort,
    defaultKeyPath,
    defaultProxyJump,
  };
}

export function SshSettings() {
  const { t } = useTranslation();
  const sshSettings = useWorkspaceStore((state) => state.sshSettings);
  const sftpSettings = useWorkspaceStore((state) => state.sftpSettings);
  const setSshSettings = useWorkspaceStore((state) => state.setSshSettings);
  const setSftpSettings = useWorkspaceStore((state) => state.setSftpSettings);
  const [sshDraft, setSshDraft] = useState(sshSettings);
  const [sftpDraft, setSftpDraft] = useState(sftpSettings);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const hasChanges =
    JSON.stringify(sshDraft) !== JSON.stringify(sshSettings) ||
    JSON.stringify(sftpDraft) !== JSON.stringify(sftpSettings);

  useEffect(() => {
    setSshDraft(sshSettings);
  }, [sshSettings]);

  useEffect(() => {
    setSftpDraft(sftpSettings);
  }, [sftpSettings]);

  async function handleBrowseKeyFile() {
    setStatus("");
    setError("");
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
      setError(browseError instanceof Error ? browseError.message : String(browseError));
    }
  }

  async function handleSave() {
    try {
      setError("");
      setStatus("");
      const nextSshSettings = normalizeSshSettingsDraft(sshDraft, t);
      const nextSftpSettings: SftpSettingsType = {
        overwriteBehavior: sftpDraft.overwriteBehavior,
      };
      const [savedSshSettings, savedSftpSettings] = isTauriRuntime()
        ? await Promise.all([
            invokeCommand("update_ssh_settings", { request: nextSshSettings }),
            invokeCommand("update_sftp_settings", { request: nextSftpSettings }),
          ])
        : [nextSshSettings, nextSftpSettings];
      setSshSettings(savedSshSettings);
      setSftpSettings(savedSftpSettings);
      setSshDraft(savedSshSettings);
      setSftpDraft(savedSftpSettings);
      setStatus(t("settings.sshDefaultsSaved"));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    }
  }

  return (
    <section className="settings-card settings-section">
      <div className="settings-section-header">
        <div className="settings-section-title">
          <ConnectionIcon className="settings-section-icon" size={34} type="ssh" />
          <div>
            <p className="panel-label">{t("settings.sectionSsh")}</p>
            <h2>{t("settings.sshDefaults")}</h2>
          </div>
        </div>
        <button
          className="toolbar-button"
          disabled={!hasChanges}
          onClick={() => void handleSave()}
          type="button"
        >
          <Save size={15} />
          {t("settings.save")}
        </button>
      </div>

      <div className="form-grid three-columns">
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
          <span>{t("settings.sftpOverwrite")}</span>
          <select
            onChange={(event) => {
              const overwriteBehavior = event.currentTarget.value as SftpOverwriteBehavior;
              setSftpDraft((settings) => ({
                ...settings,
                overwriteBehavior,
              }));
            }}
            value={sftpDraft.overwriteBehavior}
          >
            <option value="fail">{t("settings.fail")}</option>
            <option value="overwrite">{t("settings.overwrite")}</option>
          </select>
          <small className="field-hint">{t("settings.sftpOverwriteHint")}</small>
        </label>
      </div>

      <div className="form-grid ssh-default-path-grid">
        <label>
          <span>{t("settings.defaultKey")}</span>
          <div className="input-with-button">
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
          </div>
          <small className="field-hint">{t("settings.defaultKeyHint")}</small>
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

      {status ? <p className="settings-status success">{status}</p> : null}
      {error ? <p className="settings-status error">{error}</p> : null}
    </section>
  );
}
