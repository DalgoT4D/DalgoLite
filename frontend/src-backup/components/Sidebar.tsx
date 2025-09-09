'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useSidebar } from '@/contexts/SidebarContext'
import Logo from './Logo'
import { 
  Home, 
  BarChart3, 
  Database, 
  LogOut, 
  Zap, 
  ChevronLeft, 
  ChevronRight,
  Menu,
  X
} from 'lucide-react'

interface SidebarProps {
  isAuthenticated: boolean
  onLogout?: () => void
}

export default function Sidebar({ isAuthenticated, onLogout }: SidebarProps) {
  const { isCollapsed, toggleCollapsed } = useSidebar()
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  const navigationItems = [
    { name: 'Home', href: '/home', icon: Home },
    { name: 'Data Sources', href: '/dashboard', icon: Database },
    { name: 'Transformations', href: '/transform', icon: Zap },
    { name: 'Charts', href: '/charts', icon: BarChart3 },
  ]

  const handleLogout = async () => {
    try {
      const response = await fetch('http://localhost:8005/auth/logout', {
        method: 'POST',
      })
      
      if (response.ok) {
        if (onLogout) {
          onLogout()
        }
        router.push('/')
      } else {
        alert('Logout failed. Please try again.')
      }
    } catch (error) {
      alert('Logout failed. Please try again.')
    }
  }

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/'
    }
    return pathname.startsWith(href)
  }

  if (!isAuthenticated) {
    return (
      <nav className="bg-white shadow-sm border-b sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <Logo size="lg" />
            <div className="text-sm text-gray-500">
              Not connected
            </div>
          </div>
        </div>
      </nav>
    )
  }

  return (
    <>
      {/* Mobile Header */}
      <div className="lg:hidden bg-white shadow-sm border-b sticky top-0 z-50">
        <div className="flex justify-between items-center px-4 py-4">
          <Logo size="lg" />
          <button
            onClick={() => setIsMobileOpen(!isMobileOpen)}
            className="p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors"
          >
            {isMobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Menu */}
        {isMobileOpen && (
          <div className="border-t border-gray-200 py-4">
            <div className="space-y-2 px-4">
              {navigationItems.map((item) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.name}
                    onClick={() => {
                      router.push(item.href)
                      setIsMobileOpen(false)
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                      isActive(item.href)
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    <Icon size={18} />
                    {item.name}
                  </button>
                )
              })}
              
              <div className="border-t border-gray-200 pt-4 mt-4">
                <button
                  onClick={() => {
                    handleLogout()
                    setIsMobileOpen(false)
                  }}
                  className="w-full flex items-center gap-3 text-red-600 hover:text-red-700 px-3 py-2 rounded-lg transition-colors"
                >
                  <LogOut size={18} />
                  <span className="text-sm">Logout</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <div className={`fixed left-0 top-0 h-full bg-white border-r border-gray-200 shadow-sm transition-all duration-300 z-40 ${
          isCollapsed ? 'w-20' : 'w-64'
        }`}>
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <button
                onClick={() => router.push('/home')}
                className="hover:opacity-80 transition-opacity"
              >
                <Logo size="sm" compact={isCollapsed} />
              </button>
              <button
                onClick={toggleCollapsed}
                className="p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors"
              >
                {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
              </button>
            </div>

            {/* Navigation Items */}
            <div className="flex-1 p-4">
              <div className="space-y-2">
                {navigationItems.map((item) => {
                  const Icon = item.icon
                  return (
                    <button
                      key={item.name}
                      onClick={() => router.push(item.href)}
                      className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} px-3 ${isCollapsed ? 'py-6' : 'py-3'} rounded-lg text-left transition-colors ${
                        isActive(item.href)
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                      }`}
                      title={isCollapsed ? item.name : ''}
                    >
                      <Icon size={isCollapsed ? 48 : 20} />
                      {!isCollapsed && <span className="font-medium">{item.name}</span>}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Logout */}
            <div className="p-4 border-t border-gray-200">
              <button
                onClick={handleLogout}
                className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} text-red-600 hover:text-red-700 px-3 ${isCollapsed ? 'py-6' : 'py-3'} rounded-lg transition-colors`}
                title={isCollapsed ? 'Logout' : ''}
              >
                <LogOut size={isCollapsed ? 48 : 20} />
                {!isCollapsed && <span className="font-medium">Logout</span>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}