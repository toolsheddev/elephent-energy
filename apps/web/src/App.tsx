import { Route, Routes } from 'react-router-dom'
import { AppShell } from '@/layout/AppShell'
import { ProjectsPage } from '@/features/projects/ProjectsPage'
import { ProjectPage } from '@/features/project/ProjectPage'
import { TeamPage } from '@/features/team/TeamPage'
import { EmptyState } from '@/components/ui/core'

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<ProjectsPage />} />
        <Route path="projects/:projectId" element={<ProjectPage />} />
        <Route path="team" element={<TeamPage />} />
        <Route path="*" element={<EmptyState title="Page not found">That address does not match anything in System Design.</EmptyState>} />
      </Route>
    </Routes>
  )
}
