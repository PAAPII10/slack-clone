import { atom, useAtom } from "jotai";

const huddleSettingsModalAtom = atom(false);

export function useHuddleSettingsModal() {
  return useAtom(huddleSettingsModalAtom);
}
