'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { getApiUrl, API_ENDPOINTS } from '@/lib/config'

interface AuthContextType {
  isAuthenticated: boolean
  isLoading: boolean
  login: () => void
  logout: () => void
  checkAuthStatus: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

interface AuthProviderProps {
  children: ReactNode
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const checkAuthStatus = async () => {
    try {
      // Try to fetch connected sheets to check if user is authenticated
      const response = await fetch(getApiUrl(API_ENDPOINTS.SHEETS_CONNECTED))
      if (response.ok) {
        setIsAuthenticated(true)
      } else {
        setIsAuthenticated(false)
      }
    } catch (error) {
      console.error('Auth check failed:', error)
      setIsAuthenticated(false)
    } finally {
      setIsLoading(false)
    }
  }

  const login = () => {
    window.location.href = getApiUrl('/auth/google')
  }

  const logout = async () => {
    try {
      await fetch('http://localhost:8005/auth/logout', {
        method: 'POST',
      })
      setIsAuthenticated(false)
    } catch (error) {
      console.error('Logout failed:', error)
    }
  }

  useEffect(() => {
    checkAuthStatus()
  }, [])

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        login,
        logout,
        checkAuthStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}