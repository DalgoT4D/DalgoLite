'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface UserInfo {
  email?: string
  name?: string
  pictureUrl?: string
  loginCount?: number
  lastLoginAt?: string | null
}

interface AuthContextType {
  isAuthenticated: boolean
  isLoading: boolean
  isFirstLogin: boolean
  user: UserInfo | null
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
  const [isFirstLogin, setIsFirstLogin] = useState(false)
  const [user, setUser] = useState<UserInfo | null>(null)

  const fallbackProbe = async () => {
    try {
      const resp = await fetch('http://localhost:8000/sheets/connected')
      if (resp.ok) {
        setIsAuthenticated(true)
        setUser(null)
        setIsFirstLogin(false)
        return
      }
    } catch (_e) {
      // ignore
    }
    setIsAuthenticated(false)
    setUser(null)
    setIsFirstLogin(false)
  }

  const checkAuthStatus = async () => {
    try {
      // Primary probe: backend auth status with user details
      const response = await fetch('http://localhost:8000/auth/status')
      if (response.ok) {
        const data = await response.json()
        if (data.authenticated) {
          setIsAuthenticated(true)
          const u = data.user || null
          if (u) {
            const mapped: UserInfo = {
              email: u.email,
              name: u.name,
              pictureUrl: u.picture_url,
              loginCount: u.login_count,
              lastLoginAt: u.last_login_at || null,
            }
            setUser(mapped)
            console.log('DEBUG: AuthContext received user data:', {
              email: u.email,
              login_count: u.login_count,
              is_first_login: u.is_first_login
            })
            setIsFirstLogin(!!u.is_first_login)
          } else {
            setUser(null)
            setIsFirstLogin(false)
          }
        } else {
          // Unauthenticated: try fallback probe
          await fallbackProbe()
        }
      } else {
        // Non-OK: try fallback
        await fallbackProbe()
      }
    } catch (error) {
      console.error('Auth check failed:', error)
      // Network or other error: try fallback
      await fallbackProbe()
    } finally {
      setIsLoading(false)
    }
  }

  const login = () => {
    window.location.href = 'http://localhost:8000/auth/google'
  }

  const logout = async () => {
    try {
      await fetch('http://localhost:8000/auth/logout', {
        method: 'POST',
      })
      setIsAuthenticated(false)
      setUser(null)
      setIsFirstLogin(false)
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
        isFirstLogin,
        user,
        login,
        logout,
        checkAuthStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}