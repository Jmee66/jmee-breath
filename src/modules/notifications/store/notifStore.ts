import { create } from 'zustand'

interface NotifState {
  permission: NotificationPermission
  reminderEnabled: boolean
  setPermission: (permission: NotificationPermission) => void
  setReminderEnabled: (enabled: boolean) => void
}

export const useNotifStore = create<NotifState>((set) => ({
  permission: typeof Notification !== 'undefined'
    ? Notification.permission
    : 'default',
  reminderEnabled: false,
  setPermission: (permission) => set({ permission }),
  setReminderEnabled: (reminderEnabled) => set({ reminderEnabled }),
}))
