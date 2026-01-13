import { atom, useAtom } from "jotai";

type SettingsSection = "audio-video" | null;

const settingsModalAtom = atom(false);
const settingsSectionAtom = atom<SettingsSection>(null);

export function useSettingsModal() {
  const [open, setOpen] = useAtom(settingsModalAtom);
  const [section, setSection] = useAtom(settingsSectionAtom);

  const openWithSection = (section: SettingsSection) => {
    setSection(section);
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    // Reset section after a delay to allow dialog to close
    setTimeout(() => setSection(null), 300);
  };

  return [open, close, openWithSection, section] as const;
}
