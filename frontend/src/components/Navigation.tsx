'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Menu, X, Home, BarChart3, Database, LogOut, User, Zap } from 'lucide-react'
import Logo from './Logo'

interface NavigationProps {
  isAuthenticated: boolean
  onLogout?: () => void
}

export default function Navigation({ isAuthenticated, onLogout }: NavigationProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  const navigationItems = [
    { name: 'Home', href: '/home', icon: Home },
    { name: 'Connect', href: '/dashboard', icon: Database },
    { name: 'Transform', href: '/transform', icon: Zap },
    { name: 'Charts', href: '/charts', icon: BarChart3 },
  ]

  const handleLogout = async () => {
    try {
      const response = await fetch('http://localhost:8000/auth/logout', {
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

  return (
    <nav className="bg-white shadow-sm border-b sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          {/* Logo */}
          <div className="flex items-center">
            {isAuthenticated ? (
              <button
                onClick={() => router.push('/home')}
                className="hover:opacity-80 transition-opacity cursor-pointer"
                title="Go to Home"
              >
                <Logo size="lg" />
              </button>
            ) : (
              <Logo size="lg" />
            )}
          </div>

          {/* Hamburger Menu Button - Always visible when authenticated */}
          {isAuthenticated && (
            <div>
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors"
              >
                {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          )}
          
          {/* Not authenticated message for desktop */}
          {!isAuthenticated && (
            <div className="text-sm text-gray-500">
              Not connected
            </div>
          )}
        </div>

        {/* Navigation Menu - Works on all screen sizes */}
        {isAuthenticated && isMenuOpen && (
          <div className="border-t border-gray-200 py-4">
            <div className="space-y-2">
              {navigationItems.map((item) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.name}
                    onClick={() => {
                      router.push(item.href)
                      setIsMenuOpen(false)
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
              
              {/* Logout */}
              <div className="border-t border-gray-200 pt-4 mt-4">
                <button
                  onClick={() => {
                    handleLogout()
                    setIsMenuOpen(false)
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
    </nav>
  )
}