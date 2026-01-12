import { atom, useAtom } from "jotai";

const createChannelModalAtom = atom(false);

export function useCreateChannelModal() {
  return useAtom(createChannelModalAtom);
}
