import { useTranslation } from "react-i18next";
import { ConnectionIcon } from "../connections/ConnectionIcon";
import { PlannedSettingsGrid, type PlannedSetting } from "./shared";
import i18next from "../i18n/config";

const RDP_QUALITY_SETTINGS: PlannedSetting[] = [
  {
    label: i18next.t("settings.resolution"),
    value: i18next.t("settings.rdpResolutionValue"),
    hint: i18next.t("settings.rdpResolutionHint"),
  },
  {
    label: i18next.t("settings.colorDepth"),
    value: i18next.t("settings.rdpColorDepthValue"),
    hint: i18next.t("settings.rdpColorDepthHint"),
  },
  {
    label: i18next.t("settings.bandwidthProfile"),
    value: i18next.t("settings.rdpBandwidthProfileValue"),
    hint: i18next.t("settings.rdpBandwidthProfileHint"),
  },
  {
    label: i18next.t("settings.bitmapCache"),
    value: i18next.t("settings.rdpBitmapCacheValue"),
    hint: i18next.t("settings.rdpBitmapCacheHint"),
  },
  {
    label: i18next.t("settings.performanceFlags"),
    value: i18next.t("settings.rdpPerformanceFlagsValue"),
    hint: i18next.t("settings.rdpPerformanceFlagsHint"),
  },
  {
    label: i18next.t("settings.enhancedGraphics"),
    value: i18next.t("settings.rdpEnhancedGraphicsValue"),
    hint: i18next.t("settings.rdpEnhancedGraphicsHint"),
  },
];

export function RdpSettings() {
  const { t } = useTranslation();

  return (
    <section className="settings-card settings-section">
      <div className="settings-section-header">
        <div className="settings-section-title">
          <ConnectionIcon className="settings-section-icon" size={34} type="rdp" />
          <div>
            <p className="panel-label">{t("settings.sectionRdp")}</p>
            <h2>{t("settings.qualityDefaults")}</h2>
          </div>
        </div>
      </div>
      <PlannedSettingsGrid settings={RDP_QUALITY_SETTINGS} />
    </section>
  );
}
