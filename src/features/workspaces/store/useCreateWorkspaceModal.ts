import { atom, useAtom } from "jotai";

const createWorkspaceModalAtom = atom(false);

export function useCreateWorkspaceModal() {
  return useAtom(createWorkspaceModalAtom);
}
