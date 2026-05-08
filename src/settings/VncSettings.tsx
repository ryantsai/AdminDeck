import { useTranslation } from "react-i18next";
import { ConnectionIcon } from "../connections/ConnectionIcon";
import { PlannedSettingsGrid, type PlannedSetting } from "./shared";
import i18next from "../i18n/config";

const VNC_QUALITY_SETTINGS: PlannedSetting[] = [
  {
    label: i18next.t("settings.quality"),
    value: i18next.t("settings.vncQualityValue"),
    hint: i18next.t("settings.vncQualityHint"),
  },
  {
    label: i18next.t("settings.preferredEncoding"),
    value: i18next.t("settings.vncPreferredEncodingValue"),
    hint: i18next.t("settings.vncPreferredEncodingHint"),
  },
  {
    label: i18next.t("settings.jpegQuality"),
    value: i18next.t("settings.vncJpegQualityValue"),
    hint: i18next.t("settings.vncJpegQualityHint"),
  },
  {
    label: i18next.t("settings.compression"),
    value: i18next.t("settings.vncCompressionValue"),
    hint: i18next.t("settings.vncCompressionHint"),
  },
  {
    label: i18next.t("settings.colorLevel"),
    value: i18next.t("settings.vncColorLevelValue"),
    hint: i18next.t("settings.vncColorLevelHint"),
  },
  {
    label: i18next.t("settings.remoteResize"),
    value: i18next.t("settings.vncRemoteResizeValue"),
    hint: i18next.t("settings.vncRemoteResizeHint"),
  },
];

export function VncSettings() {
  const { t } = useTranslation();

  return (
    <section className="settings-card settings-section">
      <div className="settings-section-header">
        <div className="settings-section-title">
          <ConnectionIcon className="settings-section-icon" size={34} type="vnc" />
          <div>
            <p className="panel-label">{t("settings.sectionVnc")}</p>
            <h2>{t("settings.qualityDefaults")}</h2>
          </div>
        </div>
      </div>
      <PlannedSettingsGrid settings={VNC_QUALITY_SETTINGS} />
    </section>
  );
}
