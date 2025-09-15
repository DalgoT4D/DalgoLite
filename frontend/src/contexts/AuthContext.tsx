'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { getApiUrl, API_ENDPOINTS } from '@/lib/config'

interface User {
  id: number
  email: string
  name: string
  profile_picture: string
  onboarding_completed: boolean
  onboarding_step: number
}

interface AuthContextType {
  isAuthenticated: boolean
  isLoading: boolean
  user: User | null
  login: () => void
  logout: () => void
  checkAuthStatus: () => Promise<void>
  updateOnboardingStep: (step: number, data?: any) => Promise<void>
  completeOnboarding: () => Promise<void>
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
  const [user, setUser] = useState<User | null>(null)

  const checkAuthStatus = async () => {
    try {
      const response = await fetch(getApiUrl('/auth/status'))
      const data = await response.json()

      if (data.authenticated) {
        setIsAuthenticated(true)
        setUser(data.user)
      } else {
        setIsAuthenticated(false)
        setUser(null)
      }
    } catch (error) {
      console.error('Auth check failed:', error)
      setIsAuthenticated(false)
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }

  const updateOnboardingStep = async (step: number, data?: any) => {
    try {
      const response = await fetch(getApiUrl('/api/user/update-onboarding'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ step, data })
      })

      const result = await response.json()
      if (result.success && user) {
        setUser({
          ...user,
          onboarding_step: step
        })
      }
    } catch (error) {
      console.error('Failed to update onboarding step:', error)
    }
  }

  const completeOnboarding = async () => {
    try {
      const response = await fetch(getApiUrl('/api/user/complete-onboarding'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      })

      const result = await response.json()
      if (result.success && user) {
        setUser({
          ...user,
          onboarding_completed: true
        })
      }
    } catch (error) {
      console.error('Failed to complete onboarding:', error)
    }
  }

  const login = () => {
    window.location.href = getApiUrl('/auth/google')
  }

  const logout = async () => {
    try {
      await fetch(getApiUrl('/auth/logout'), {
        method: 'POST',
      })
      setIsAuthenticated(false)
      setUser(null)
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
        user,
        login,
        logout,
        checkAuthStatus,
        updateOnboardingStep,
        completeOnboarding
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}