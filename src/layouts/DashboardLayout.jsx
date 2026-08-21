import React, { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from '../components/dashboard/Sidebar'
import DashboardHeader from '../components/dashboard/DashboardHeader'
import '../styles/dashboard.css'

export default function DashboardLayout() {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)

  return (
    <div
      className={`dashboard-shell ${isCollapsed ? 'sidebar-collapsed' : ''} ${
        isMobileOpen ? 'mobile-drawer-open' : ''
      }`}
    >
      {/* Sidebar Navigation */}
      <Sidebar
        isCollapsed={isCollapsed}
        onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
        isMobileOpen={isMobileOpen}
        onCloseMobile={() => setIsMobileOpen(false)}
      />

      {/* Mobile Drawer Overlay Back-drop */}
      <div
        className="mobile-nav-backdrop"
        onClick={() => setIsMobileOpen(false)}
        aria-hidden="true"
      ></div>

      {/* Main Content Pane */}
      <div className="dashboard-container-main">
        <DashboardHeader onMenuToggle={() => setIsMobileOpen(true)} />
        <main className="dashboard-content-area">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
