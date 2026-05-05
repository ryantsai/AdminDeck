import { useTranslation } from "react-i18next";
import { ConnectionIcon } from "../connections/ConnectionIcon";
import { useWorkspaceStore } from "../store";
import { SettingsSummary } from "./shared";

export function SshSettings() {
  const { t } = useTranslation();
  const sshSettings = useWorkspaceStore((state) => state.sshSettings);
  const sftpSettings = useWorkspaceStore((state) => state.sftpSettings);

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
      </div>
      <div className="settings-summary-grid">
        <SettingsSummary label={t("settings.defaultUser")} value={sshSettings.defaultUser} />
        <SettingsSummary label={t("settings.defaultPort")} value={String(sshSettings.defaultPort)} />
        <SettingsSummary label={t("settings.defaultKey")} value={sshSettings.defaultKeyPath || t("settings.notSet")} />
        <SettingsSummary label={t("settings.proxyJump")} value={sshSettings.defaultProxyJump || t("settings.notSet")} />
        <SettingsSummary
          label={t("settings.sftpOverwrite")}
          value={sftpSettings.overwriteBehavior === "overwrite" ? t("settings.overwrite") : t("settings.fail")}
        />
      </div>
    </section>
  );
}
