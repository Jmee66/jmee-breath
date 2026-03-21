import { create } from 'zustand'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

interface CoachState {
  messages: ChatMessage[]
  isStreaming: boolean
  addMessage: (message: ChatMessage) => void
  appendToLast: (delta: string) => void
  setStreaming: (streaming: boolean) => void
  clear: () => void
}

export const useCoachStore = create<CoachState>((set) => ({
  messages: [],
  isStreaming: false,
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),
  appendToLast: (delta) =>
    set((state) => {
      const messages = [...state.messages]
      const last = messages[messages.length - 1]
      if (last && last.role === 'assistant') {
        messages[messages.length - 1] = { ...last, content: last.content + delta }
      }
      return { messages }
    }),
  setStreaming: (isStreaming) => set({ isStreaming }),
  clear: () => set({ messages: [] }),
}))
