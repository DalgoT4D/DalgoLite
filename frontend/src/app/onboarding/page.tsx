'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle, ArrowRight, Sparkles, Database, BarChart3, GitMerge, Play, Target, Zap } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

interface OnboardingStep {
  id: string
  title: string
  description: string
  icon: any
  route: string
  completed: boolean
}

export default function OnboardingPage() {
  const { isAuthenticated, isLoading, isFirstLogin, user } = useAuth()
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(0)

  const onboardingSteps: OnboardingStep[] = [
    {
      id: 'connect',
      title: 'Connect Your Data',
      description: 'Import your first Google Sheet to get started with data analysis',
      icon: Database,
      route: '/dashboard',
      completed: false
    },
    {
      id: 'transform',
      title: 'Transform & Combine',
      description: 'Merge multiple sheets and apply transformations to create powerful datasets',
      icon: GitMerge,
      route: '/transform',
      completed: false
    },
    {
      id: 'visualize',
      title: 'Create Visualizations',
      description: 'Build stunning charts and dashboards with AI-powered recommendations',
      icon: BarChart3,
      route: '/charts',
      completed: false
    }
  ]

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        router.push('/')
      }
    }
  }, [isAuthenticated, isLoading, router])

  const handleStartOnboarding = () => {
    // Start with the first step - Dashboard
    router.push('/dashboard?onboarding=true')
  }

  const handleSkipOnboarding = () => {
    router.push('/home')
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Preparing your workspace...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex justify-center mb-6">
            <div className="bg-white rounded-full p-4 shadow-lg">
              <Sparkles className="text-blue-600" size={40} />
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Welcome{user?.name ? `, ${user.name}` : ''}!
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Let's get you set up with DalgoLite in just 3 simple steps. 
            We'll guide you through connecting data, transforming it, and creating beautiful visualizations.
          </p>
        </div>

        {/* Onboarding Steps */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden mb-8">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-8 text-white">
            <h2 className="text-2xl font-bold mb-2">Your Journey to Data Insights</h2>
            <p className="text-blue-100">Follow these steps to unlock the full power of your data</p>
          </div>

          <div className="p-8">
            <div className="space-y-6">
              {onboardingSteps.map((step, index) => {
                const Icon = step.icon
                return (
                  <div key={step.id} className="flex items-start gap-6 p-6 rounded-xl border border-gray-200 hover:border-blue-300 transition-colors">
                    <div className="flex-shrink-0">
                      <div className="bg-blue-100 text-blue-700 w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg">
                        {index + 1}
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Icon className="text-blue-600" size={24} />
                        <h3 className="text-xl font-semibold text-gray-900">{step.title}</h3>
                      </div>
                      <p className="text-gray-600 mb-4">{step.description}</p>
                      <div className="flex items-center gap-2 text-sm text-blue-600">
                        <Target size={16} />
                        <span>Next: {step.route}</span>
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      <div className="w-6 h-6 rounded-full border-2 border-gray-300"></div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Benefits Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 mb-8">
          <h3 className="text-xl font-semibold text-gray-900 mb-6 text-center">What you'll achieve</h3>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="bg-green-100 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <Zap className="text-green-600" size={24} />
              </div>
              <h4 className="font-semibold text-gray-900 mb-2">Lightning Fast</h4>
              <p className="text-sm text-gray-600">Connect and analyze your data in seconds, not hours</p>
            </div>
            <div className="text-center">
              <div className="bg-purple-100 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <BarChart3 className="text-purple-600" size={24} />
              </div>
              <h4 className="font-semibold text-gray-900 mb-2">Smart Insights</h4>
              <p className="text-sm text-gray-600">AI-powered recommendations for the best visualizations</p>
            </div>
            <div className="text-center">
              <div className="bg-blue-100 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <GitMerge className="text-blue-600" size={24} />
              </div>
              <h4 className="font-semibold text-gray-900 mb-2">Powerful Transformations</h4>
              <p className="text-sm text-gray-600">Combine and transform multiple datasets effortlessly</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={handleStartOnboarding}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-8 rounded-lg text-lg inline-flex items-center justify-center gap-2 transition-colors shadow-lg"
          >
            <Play size={20} />
            Start Guided Setup
          </button>
          <button
            onClick={handleSkipOnboarding}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-4 px-8 rounded-lg text-lg inline-flex items-center justify-center gap-2 transition-colors"
          >
            Skip to Dashboard
          </button>
        </div>

        {/* Progress Indicator */}
        <div className="mt-8 text-center">
          <div className="inline-flex items-center gap-2 text-sm text-gray-500">
            <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
            <span>Step 1 of 3: Welcome & Setup</span>
          </div>
        </div>
      </main>
    </div>
  )
}


