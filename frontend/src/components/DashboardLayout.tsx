'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSidebar } from '@/contexts/SidebarContext'
import Sidebar from './Sidebar'
import Logo from './Logo'

interface DashboardLayoutProps {
  isAuthenticated: boolean
  onLogout?: () => void
  children: React.ReactNode
}

export default function DashboardLayout({ isAuthenticated, onLogout, children }: DashboardLayoutProps) {
  const router = useRouter()
  const { isCollapsed } = useSidebar()

  if (!isAuthenticated) {
    return (
      <>
        {/* Header for non-authenticated users */}
        <header className="bg-white shadow-sm border-b sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-4">
              <button
                onClick={() => router.push('/')}
                className="hover:opacity-80 transition-opacity"
              >
                <Logo size="lg" />
              </button>
              <div className="text-sm text-gray-500">
                Not connected
              </div>
            </div>
          </div>
        </header>
        <main className="min-h-screen bg-gray-50">
          {children}
        </main>
      </>
    )
  }

  return (
    <>
      <Sidebar isAuthenticated={isAuthenticated} onLogout={onLogout} />
      
      {/* Header for authenticated users - Logo is now in sidebar */}
      <header className={`bg-white shadow-sm border-b sticky top-0 z-30 transition-all duration-300 ${
        isCollapsed ? 'lg:pl-20' : 'lg:pl-64'
      }`}>
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex justify-start items-center py-4">
            {/* Logo is now only in the sidebar */}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className={`min-h-screen bg-gray-50 transition-all duration-300 ${
        isCollapsed ? 'lg:pl-20' : 'lg:pl-64'
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </div>
      </main>
    </>
  )
}