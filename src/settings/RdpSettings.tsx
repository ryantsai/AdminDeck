import { useTranslation } from "react-i18next";
import { ConnectionIcon } from "../connections/ConnectionIcon";
import { PlannedSettingsGrid, type PlannedSetting } from "./shared";

const RDP_QUALITY_SETTINGS: PlannedSetting[] = [
  {
    label: "Resolution",
    value: "Fit workspace bounds",
    hint: "Maps to DesktopWidth, DesktopHeight, SmartSizing, and display sync.",
  },
  {
    label: "Color depth",
    value: "32-bit",
    hint: "Uses the ActiveX ColorDepth property.",
  },
  {
    label: "Bandwidth profile",
    value: "Auto detect",
    hint: "Uses bandwidth detection or NetworkConnectionType classes instead of a raw bitrate cap.",
  },
  {
    label: "Bitmap cache",
    value: "Persistent cache planned",
    hint: "Maps to BitmapPersistence and CachePersistenceActive.",
  },
  {
    label: "Performance flags",
    value: "Balanced",
    hint: "Controls wallpaper, full-window drag, menu animations, themes, cursors, and font smoothing.",
  },
  {
    label: "Enhanced graphics",
    value: "Prefer when supported",
    hint: "Uses RDP performance flags on capable servers.",
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
