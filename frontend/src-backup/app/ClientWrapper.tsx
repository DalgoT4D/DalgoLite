'use client'

import { useAuth } from '@/contexts/AuthContext'
import { usePathname } from 'next/navigation'
import Navigation from '@/components/Navigation'

interface ClientWrapperProps {
  children: React.ReactNode
}

export default function ClientWrapper({ children }: ClientWrapperProps) {
  const { isAuthenticated, isLoading, logout } = useAuth()
  const pathname = usePathname()
  
  // Don't show navigation on the landing page
  const showNavigation = pathname !== '/' && !isLoading

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <>
      {showNavigation && (
        <Navigation 
          isAuthenticated={isAuthenticated} 
          onLogout={logout} 
        />
      )}
      <main className={showNavigation ? '' : ''}>
        {children}
      </main>
    </>
  )
}