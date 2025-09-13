'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { CheckCircle, XCircle, RefreshCw, User, LogOut, ArrowRight } from 'lucide-react'

export default function TestFlowPage() {
  const { isAuthenticated, isLoading, user, login, logout, checkAuthStatus, updateOnboardingStep, completeOnboarding } = useAuth()
  const router = useRouter()
  const [testStatus, setTestStatus] = useState<string>('')

  const handleLogin = () => {
    setTestStatus('Redirecting to Google Sign-In...')
    login()
  }

  const handleLogout = async () => {
    setTestStatus('Logging out...')
    await logout()
    setTestStatus('Logged out successfully')
  }

  const handleRefreshStatus = async () => {
    setTestStatus('Refreshing auth status...')
    await checkAuthStatus()
    setTestStatus('Auth status refreshed')
  }

  const handleResetOnboarding = async () => {
    if (!user) return
    setTestStatus('Resetting onboarding...')
    await updateOnboardingStep(0, { reset: true })
    await fetch('http://localhost:8053/api/user/update-onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: false, step: 0 })
    })
    await checkAuthStatus()
    setTestStatus('Onboarding reset - user will be redirected to onboarding on next login')
  }

  const handleCompleteOnboarding = async () => {
    if (!user) return
    setTestStatus('Completing onboarding...')
    await completeOnboarding()
    await checkAuthStatus()
    setTestStatus('Onboarding completed - user will be redirected to home on next login')
  }

  const handleSimulateNewUser = async () => {
    setTestStatus('Simulating new user flow...')
    // First logout
    await logout()
    // Then login - this will create a new user or login existing
    setTimeout(() => {
      login()
    }, 1000)
  }

  const handleSimulateReturningUser = () => {
    if (user?.onboarding_completed) {
      setTestStatus('User is already marked as returning (onboarding completed)')
      router.push('/home')
    } else {
      setTestStatus('User needs to complete onboarding first')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">User Flow Test Page</h1>

        {/* Current Status */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Current Status</h2>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Loading:</span>
              <span className={`font-mono ${isLoading ? 'text-yellow-600' : 'text-gray-800'}`}>
                {isLoading ? 'Yes' : 'No'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-gray-600">Authenticated:</span>
              <div className="flex items-center gap-2">
                {isAuthenticated ? (
                  <CheckCircle className="text-green-600" size={20} />
                ) : (
                  <XCircle className="text-red-600" size={20} />
                )}
                <span className="font-mono">{isAuthenticated ? 'Yes' : 'No'}</span>
              </div>
            </div>

            {user && (
              <>
                <div className="border-t pt-3 mt-3">
                  <h3 className="font-semibold mb-2">User Info:</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">ID:</span>
                      <span className="font-mono">{user.id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Email:</span>
                      <span className="font-mono">{user.email}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Name:</span>
                      <span className="font-mono">{user.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Onboarding Completed:</span>
                      <span className={`font-mono ${user.onboarding_completed ? 'text-green-600' : 'text-yellow-600'}`}>
                        {user.onboarding_completed ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Onboarding Step:</span>
                      <span className="font-mono">{user.onboarding_step}</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Test Actions */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Test Actions</h2>

          <div className="grid grid-cols-2 gap-4">
            {!isAuthenticated ? (
              <button
                onClick={handleLogin}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <User size={20} />
                Sign In with Google
              </button>
            ) : (
              <>
                <button
                  onClick={handleLogout}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <LogOut size={20} />
                  Logout
                </button>

                <button
                  onClick={handleRefreshStatus}
                  className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <RefreshCw size={20} />
                  Refresh Status
                </button>

                <button
                  onClick={handleResetOnboarding}
                  className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                  Reset Onboarding
                </button>

                <button
                  onClick={handleCompleteOnboarding}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                  Complete Onboarding
                </button>
              </>
            )}
          </div>
        </div>

        {/* Flow Simulation */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Flow Simulation</h2>

          <div className="space-y-4">
            <button
              onClick={handleSimulateNewUser}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              <ArrowRight size={20} />
              Simulate New User Flow (Logout → Login → Onboarding)
            </button>

            <button
              onClick={handleSimulateReturningUser}
              disabled={!user || !user.onboarding_completed}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              <ArrowRight size={20} />
              Simulate Returning User Flow (Go to Home)
            </button>
          </div>
        </div>

        {/* Navigation */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Manual Navigation</h2>

          <div className="grid grid-cols-3 gap-4">
            <button
              onClick={() => router.push('/')}
              className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg font-medium transition-colors"
            >
              Landing Page (/)
            </button>
            <button
              onClick={() => router.push('/onboarding')}
              className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg font-medium transition-colors"
            >
              Onboarding
            </button>
            <button
              onClick={() => router.push('/home')}
              className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg font-medium transition-colors"
            >
              Home
            </button>
          </div>
        </div>

        {/* Test Status Messages */}
        {testStatus && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-blue-800">{testStatus}</p>
          </div>
        )}
      </div>
    </div>
  )
}