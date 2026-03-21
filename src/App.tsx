import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from '@modules/theme'

import HomePage from '@pages/HomePage'
import SessionPage from '@pages/SessionPage'
import JournalPageRoute from '@pages/JournalPageRoute'
import StatsPageRoute from '@pages/StatsPageRoute'
import ExercisesPageRoute from '@pages/ExercisesPageRoute'
import CoachPageRoute from '@pages/CoachPageRoute'
import FreeTimerPageRoute from '@pages/FreeTimerPageRoute'
import ProfilePageRoute from '@pages/ProfilePageRoute'
import SettingsPageRoute from '@pages/SettingsPageRoute'

export default function App() {
  return (
    <BrowserRouter basename="/apnea-pwa">
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="session" element={<SessionPage />} />
          <Route path="journal" element={<JournalPageRoute />} />
          <Route path="stats" element={<StatsPageRoute />} />
          <Route path="exercises" element={<ExercisesPageRoute />} />
          <Route path="coach" element={<CoachPageRoute />} />
          <Route path="timer" element={<FreeTimerPageRoute />} />
          <Route path="profile" element={<ProfilePageRoute />} />
          <Route path="settings" element={<SettingsPageRoute />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
