import { useTranslation } from "react-i18next";
import { ConnectionIcon } from "../connections/ConnectionIcon";
import { PlannedSettingsGrid, type PlannedSetting } from "./shared";

const VNC_QUALITY_SETTINGS: PlannedSetting[] = [
  {
    label: "Quality",
    value: "Auto",
    hint: "Let the client adapt encoding and pixel format to link speed.",
  },
  {
    label: "Preferred encoding",
    value: "Tight, then ZRLE",
    hint: "Current client also advertises CopyRect, Raw, cursor, and desktop-size support.",
  },
  {
    label: "JPEG quality",
    value: "8 / 9",
    hint: "Useful for Tight/JPEG-style encodings.",
  },
  {
    label: "Compression",
    value: "2 / 9",
    hint: "Higher values reduce bandwidth at a CPU cost.",
  },
  {
    label: "Color level",
    value: "Full color",
    hint: "Can degrade to 256, 64, or 8 colors for slower links.",
  },
  {
    label: "Remote resize",
    value: "Follow server support",
    hint: "Depends on the VNC server supporting desktop-size updates.",
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
