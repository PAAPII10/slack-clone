import { atom, useAtom } from "jotai";

const showHuddleDialogAtom = atom<boolean>(false);

export function useShowHuddleDialog() {
  return useAtom(showHuddleDialogAtom);
}
