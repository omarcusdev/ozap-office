import { create } from "zustand"

type WsStore = {
  connected: boolean
  setConnected: (connected: boolean) => void
}

export const useWsStore = create<WsStore>((set) => ({
  connected: false,
  setConnected: (connected) => set({ connected }),
}))
