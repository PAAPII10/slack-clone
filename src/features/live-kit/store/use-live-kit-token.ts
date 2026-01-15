import { atom, useAtom } from "jotai";

const liveKitTokenAtom = atom<{ token: string; url: string } | null>(null);

export function useLiveKitToken() {
  return useAtom(liveKitTokenAtom);
}
