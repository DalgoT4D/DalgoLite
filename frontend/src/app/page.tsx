'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { SheetIcon, BarChart3, TrendingUp, Link, Users, Heart, Target, CheckCircle, ArrowRight, Database, Zap, GitMerge, Layers, Settings } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import Logo from '@/components/Logo'
import GoogleSignInButton from '@/components/GoogleSignInButton'

export default function LandingPage() {
  const { isAuthenticated, isLoading, login, checkAuthStatus, user } = useAuth()
  const router = useRouter()

  useEffect(() => {
    // Check if user was redirected from OAuth callback
    const urlParams = new URLSearchParams(window.location.search)
    const userId = urlParams.get('user_id')

    if (userId) {
      // Clean up URL
      window.history.replaceState({}, document.title, '/')
      // Refresh auth status to get user data
      checkAuthStatus()
    }
  }, [checkAuthStatus])

  useEffect(() => {
    // Handle routing based on user status
    if (!isLoading && isAuthenticated && user) {
      if (!user.onboarding_completed) {
        // New user or incomplete onboarding - go to onboarding
        router.push('/onboarding/onboarding_1')
      } else {
        // Existing user with completed onboarding - go to home
        router.push('/home')
      }
    }
  }, [isAuthenticated, isLoading, user, router])

  const handleConnect = () => {
    login()
  }

  const handleGoToHome = () => {
    router.push('/home')
  }

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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Navigation */}
        <nav className="relative z-10 bg-white/80 backdrop-blur-md border-b border-white/20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-4">
              <Logo size="sm" />
              <div className="flex items-center gap-4">
                {isAuthenticated ? (
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-green-600 bg-green-50 px-3 py-2 rounded-lg">
                      <CheckCircle size={20} />
                      <span className="font-medium">Connected</span>
                    </div>
                    <button
                      onClick={handleGoToHome}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                    >
                      Go to Home
                    </button>
                  </div>
                ) : (
                  <GoogleSignInButton onClick={handleConnect} />
                )}
              </div>
            </div>
          </div>
        </nav>

        {/* Hero Content */}
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center">
            <h1 className="text-5xl md:text-7xl font-bold text-gray-900 mb-6 leading-tight">
              Transform Your
              <span className="text-blue-600 block">Data</span>
              Into Insights
            </h1>
            
            <p className="text-xl md:text-2xl text-gray-600 mb-8 max-w-3xl mx-auto leading-relaxed">
              Empower your NGO with intelligent data visualization and transformation. Connect Google Sheets, 
              merge multiple datasets, and create beautiful automated dashboards with AI-powered insights.
            </p>

            {/* Connection Status */}
            {!isAuthenticated ? (
              <div className="bg-white/80 backdrop-blur-md rounded-2xl p-8 shadow-xl max-w-md mx-auto mb-12">
                <div className="text-center">
                  <div className="bg-blue-100 rounded-full p-4 w-16 h-16 mx-auto mb-4">
                    <Link className="text-blue-600" size={32} />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">Get Started in Seconds</h3>
                  <p className="text-gray-600 mb-6">
                    Simply sign in with your Google account to connect your Google Sheets and start analyzing and visualizing your data.
                  </p>
                  <div className="flex justify-center">
                    <GoogleSignInButton onClick={handleConnect} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white/80 backdrop-blur-md rounded-2xl p-8 shadow-xl max-w-md mx-auto mb-12">
                <div className="text-center">
                  <div className="bg-green-100 rounded-full p-4 w-16 h-16 mx-auto mb-4">
                    <CheckCircle className="text-green-600" size={32} />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">Ready to Analyze!</h3>
                  <p className="text-gray-600 mb-6">
                    You're connected and ready to start creating amazing visualizations from your data.
                  </p>
                  <button
                    onClick={handleGoToHome}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <ArrowRight size={20} />
                    Go to Home
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Background Elements */}
        <div className="absolute top-0 right-0 -translate-y-12 translate-x-12 opacity-20">
          <div className="w-72 h-72 bg-gradient-to-br from-blue-400 to-purple-600 rounded-full blur-3xl"></div>
        </div>
        <div className="absolute bottom-0 left-0 translate-y-12 -translate-x-12 opacity-20">
          <div className="w-72 h-72 bg-gradient-to-br from-green-400 to-blue-600 rounded-full blur-3xl"></div>
        </div>
      </div>

      {/* Features Section */}
      <div className="bg-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Built for Impact-Driven Organizations
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Everything you need to turn your mission data into compelling visual stories and automated insights.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-16">
            <div className="text-center p-8 bg-blue-50 rounded-2xl">
              <div className="bg-blue-600 text-white rounded-full p-4 w-16 h-16 mx-auto mb-6">
                <Link size={32} />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">Instant Connection</h3>
              <p className="text-gray-600">
                Securely connect to Google Sheets with one click. No complicated setup or data migration required.
              </p>
            </div>

            <div className="text-center p-8 bg-green-50 rounded-2xl">
              <div className="bg-green-600 text-white rounded-full p-4 w-16 h-16 mx-auto mb-6">
                <BarChart3 size={32} />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">Smart Recommendations</h3>
              <p className="text-gray-600">
                AI analyzes your data structure and suggests the most effective chart types for your specific use case.
              </p>
            </div>

            <div className="text-center p-8 bg-orange-50 rounded-2xl">
              <div className="bg-orange-600 text-white rounded-full p-4 w-16 h-16 mx-auto mb-6">
                <Zap size={32} />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">Data Transformation</h3>
              <p className="text-gray-600">
                Merge multiple sheets, create automated pipelines, and transform raw data into insights with an intuitive visual canvas.
              </p>
            </div>
          </div>

          {/* New Data Transformation Section */}
          <div className="bg-gradient-to-br from-green-50 to-emerald-100 rounded-3xl p-8 md:p-12 mb-16">
            <div className="text-center mb-12">
              <div className="bg-green-600 text-white rounded-full p-4 w-20 h-20 mx-auto mb-6">
                <Database size={40} />
              </div>
              <h3 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
                Powerful Data Transformation
              </h3>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-8">
                Transform your approach to data analysis with our intelligent pipeline system designed for every skill level.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              <div className="bg-white rounded-xl p-6 shadow-sm border border-green-200">
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-green-100 rounded-lg p-2">
                    <Layers size={20} className="text-green-600" />
                  </div>
                  <h4 className="font-semibold text-gray-900">Simple Mode</h4>
                </div>
                <p className="text-gray-600 mb-4">Perfect for beginners. Drag-and-drop interface to combine sheets, with guided suggestions for common transformations.</p>
                <div className="text-sm text-green-700 bg-green-50 px-3 py-1 rounded-full inline-block">
                  No technical skills required
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 shadow-sm border border-orange-200">
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-orange-100 rounded-lg p-2">
                    <GitMerge size={20} className="text-orange-600" />
                  </div>
                  <h4 className="font-semibold text-gray-900">Advanced Mode</h4>
                </div>
                <p className="text-gray-600 mb-4">For power users. Advanced filtering, custom calculations, and complex data joins with visual pipeline builder.</p>
                <div className="text-sm text-orange-700 bg-orange-50 px-3 py-1 rounded-full inline-block">
                  Visual pipeline designer
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 shadow-sm border border-purple-200">
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-purple-100 rounded-lg p-2">
                    <Settings size={20} className="text-purple-600" />
                  </div>
                  <h4 className="font-semibold text-gray-900">Expert Mode</h4>
                </div>
                <p className="text-gray-600 mb-4">Full control with custom SQL-like queries, scheduled automation, and enterprise-grade data warehousing.</p>
                <div className="text-sm text-purple-700 bg-purple-50 px-3 py-1 rounded-full inline-block">
                  Code-based transformations
                </div>
              </div>
            </div>

            <div className="mt-8 bg-white/60 backdrop-blur-sm rounded-xl p-6 border border-green-200">
              <div className="flex items-start gap-4">
                <div className="bg-green-600 text-white rounded-full p-2">
                  <TrendingUp size={20} />
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 mb-2">Automated Pipeline Intelligence</h4>
                  <p className="text-gray-600">
                    Set up once, run automatically. Your transformed data stays fresh with scheduled updates, 
                    and charts automatically reflect the latest insights from your source sheets.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Success Stories */}
          <div className="bg-gray-50 rounded-2xl p-8 md:p-12">
            <div className="text-center mb-12">
              <h3 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
                Trusted by Impact Organizations
              </h3>
              <p className="text-lg text-gray-600">
                Join NGOs worldwide who are transforming their data into actionable insights.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-xl shadow-sm">
                <div className="flex items-start gap-4 mb-4">
                  <div className="bg-blue-100 rounded-full p-3">
                    <Users size={24} className="text-blue-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-1">Education Initiative</h4>
                    <p className="text-sm text-gray-600">Rural Development NGO</p>
                  </div>
                </div>
                <p className="text-gray-700">
                  "DalgoLite helped us visualize our impact across 50 villages. The automatic chart suggestions 
                  saved hours of work and made our donor reports much more compelling."
                </p>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm">
                <div className="flex items-start gap-4 mb-4">
                  <div className="bg-green-100 rounded-full p-3">
                    <Target size={24} className="text-green-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-1">Health Outreach Program</h4>
                    <p className="text-sm text-gray-600">Community Health Organization</p>
                  </div>
                </div>
                <p className="text-gray-700">
                  "The real-time sync with our Google Sheets means our dashboard always shows current 
                  vaccination rates and health metrics. It's transformed how we report to stakeholders."
                </p>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm">
                <div className="flex items-start gap-4 mb-4">
                  <div className="bg-orange-100 rounded-full p-3">
                    <Database size={24} className="text-orange-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-1">Multi-Region Program</h4>
                    <p className="text-sm text-gray-600">International Development NGO</p>
                  </div>
                </div>
                <p className="text-gray-700">
                  "The transformation pipeline automatically merges data from 12 regional offices. 
                  What used to take days of manual work now updates automatically every morning."
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-blue-600 py-20">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            Ready to Transform Your Data?
          </h2>
          <p className="text-xl text-blue-100 mb-8">
            Start creating beautiful, impactful visualizations from your spreadsheet data in minutes.
          </p>
          
          {isAuthenticated && (
            <button 
              onClick={handleGoToHome}
              className="bg-white text-blue-600 hover:bg-gray-50 font-semibold py-4 px-8 rounded-lg text-lg inline-flex items-center gap-2 transition-colors"
            >
              <ArrowRight size={24} />
              Continue to Home
            </button>
          )}
        </div>
      </div>
    </div>
  )
}