import { atom, useAtom } from "jotai";

const showChannelHuddleDialogAtom = atom<boolean>(false);

export function useShowChannelHuddleDialog() {
  return useAtom(showChannelHuddleDialogAtom);
}
