'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Database, ArrowRight, Plus, Link2, CheckCircle2, RefreshCw, Eye, AlertCircle } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { getApiUrl } from '@/lib/config'

interface ConnectedSheet {
  id: number
  spreadsheet_id: string
  spreadsheet_url: string
  title: string
  sheet_name: string
  connected_at: string
  last_synced: string
  total_rows: number
  columns: string[]
  sample_data: string[][]
}

interface ProgressRibbonProps {
  currentStep: number
  totalSteps: number
}

function ProgressRibbon({ currentStep, totalSteps }: ProgressRibbonProps) {
  const steps = ['Connect Data', 'Transform', 'Visualize']

  return (
    <div className="bg-white border-b border-gray-200 py-6">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-medium text-gray-900">Onboarding Progress</h2>
          <span className="text-base text-gray-500">{currentStep} of {totalSteps}</span>
        </div>
        <div className="w-full">
          <div className="flex items-center justify-center">
            {Array.from({ length: totalSteps }, (_, i) => (
              <div key={i} className="flex-1 flex flex-col items-center">
                <div className="flex items-center w-full">
                  <div className="flex-1 flex items-center">
                    <div
                      className={`h-3 w-full rounded-full ${
                        i + 1 <= currentStep
                          ? 'bg-blue-600'
                          : i + 1 === currentStep
                            ? 'bg-blue-300'
                            : 'bg-gray-200'
                      }`}
                    />
                    {i < totalSteps - 1 && (
                      <ArrowRight
                        className={`mx-3 h-5 w-5 flex-shrink-0 ${
                          i + 1 < currentStep ? 'text-blue-600' : 'text-gray-300'
                        }`}
                      />
                    )}
                  </div>
                </div>
                <span className="mt-3 text-sm text-gray-600 font-medium">{steps[i]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Onboarding1Page() {
  const { isAuthenticated } = useAuth()
  const router = useRouter()
  const [newSheetUrl, setNewSheetUrl] = useState('')
  const [addingSheet, setAddingSheet] = useState(false)
  const [sheets, setSheets] = useState<ConnectedSheet[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshingSheets, setRefreshingSheets] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (isAuthenticated) {
      fetchConnectedSheets()
    }
  }, [isAuthenticated])

  useEffect(() => {
    // Check if we should scroll to connected sheets (after connecting a new sheet)
    const urlParams = new URLSearchParams(window.location.search)
    if (urlParams.get('scrollToSheets') === 'true' && sheets.length > 0) {
      // Remove the query parameter
      window.history.replaceState({}, '', window.location.pathname)
      // Scroll to the connected sheets section
      setTimeout(() => {
        const sheetsSection = document.getElementById('connected-sheets-section')
        if (sheetsSection) {
          sheetsSection.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, 100)
    }
  }, [sheets])

  const fetchConnectedSheets = async () => {
    try {
      setLoading(true)
      const response = await fetch(getApiUrl('/sheets/connected'))
      if (response.ok) {
        const data = await response.json()
        setSheets(data.sheets)
      }
    } catch (error) {
      console.error('Error fetching sheets:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddSheet = async () => {
    if (!newSheetUrl.trim()) return

    setAddingSheet(true)
    try {
      const response = await fetch(getApiUrl('/sheets/analyze'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          spreadsheet_id: newSheetUrl,
          range: 'Sheet1!A:Z'
        }),
      })

      if (response.ok) {
        const result = await response.json()
        setNewSheetUrl('')
        // Refresh the page with scroll parameter to show the connected sheet
        window.location.href = `${window.location.pathname}?scrollToSheets=true`
      } else {
        const error = await response.json()
        let errorMessage = error.detail || 'Unknown error occurred'

        if (errorMessage.includes('This operation is not supported for this document')) {
          errorMessage = 'This file is not a Google Sheets document. Please make sure you\'re connecting to a Google Sheets file, not an Excel or other document type. Try creating a new Google Sheet or converting your Excel file to Google Sheets format.'
        } else if (errorMessage.includes('not authenticated')) {
          errorMessage = 'Authentication expired. Please refresh the page and sign in again.'
        } else if (errorMessage.includes('Unable to access')) {
          errorMessage = 'Unable to access this sheet. Please ensure: \n1. The link is correct and points to a Google Sheets file\n2. The sheet is shared publicly or with your account\n3. You have permission to view the sheet'
        }

        alert(`Error: ${errorMessage}`)
      }
    } catch (error) {
      console.error('Connection error:', error)
      alert('Error connecting to sheet. Please check your internet connection and try again.')
    } finally {
      setAddingSheet(false)
    }
  }

  const handleRefreshSheet = async (sheetId: number) => {
    setRefreshingSheets(prev => new Set([...Array.from(prev), sheetId]))
    try {
      const response = await fetch(getApiUrl(`/sheets/${sheetId}/resync`), {
        method: 'POST',
      })
      if (response.ok) {
        await fetchConnectedSheets()
      } else {
        alert('Failed to refresh sheet data. Please try again.')
      }
    } catch (error) {
      console.error('Error refreshing sheet:', error)
      alert('Error refreshing sheet data. Please try again.')
    } finally {
      setRefreshingSheets(prev => {
        const newSet = new Set(prev)
        newSet.delete(sheetId)
        return newSet
      })
    }
  }

  const getSyncStatus = (lastSynced: string) => {
    const syncTime = new Date(lastSynced)
    const now = new Date()
    const diffMinutes = (now.getTime() - syncTime.getTime()) / (1000 * 60)

    if (diffMinutes < 2) {
      return { status: 'success', message: 'Just synced', icon: CheckCircle2, color: 'text-green-600' }
    } else if (diffMinutes < 60) {
      return { status: 'success', message: `${Math.floor(diffMinutes)}m ago`, icon: CheckCircle2, color: 'text-green-600' }
    } else if (diffMinutes < 1440) {
      return { status: 'warning', message: `${Math.floor(diffMinutes / 60)}h ago`, icon: AlertCircle, color: 'text-yellow-600' }
    } else {
      return { status: 'error', message: 'Needs sync', icon: AlertCircle, color: 'text-red-600' }
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <ProgressRibbon currentStep={1} totalSteps={3} />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <div className="flex justify-center mb-6">
            <div className="bg-blue-100 rounded-full p-6">
              <Database className="text-blue-600" size={48} />
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Step 1: Connect Your Data
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Let's start by connecting your first Google Sheet. This will be the foundation for all your data transformations and visualizations.
          </p>
        </div>

        {/* Connected Sheets Section - Show if user has sheets */}
        {!loading && sheets.length > 0 && (
          <div id="connected-sheets-section" className="bg-white rounded-xl shadow-sm border p-8 mb-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Your Connected Sheets</h2>
              <button
                onClick={() => router.push('/onboarding/onboarding_2')}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg inline-flex items-center gap-2 transition-colors"
              >
                Continue to Next Step
                <ArrowRight size={20} />
              </button>
            </div>
            <div className="grid gap-4">
              {sheets.map((sheet) => {
                const syncStatus = getSyncStatus(sheet.last_synced)
                const StatusIcon = syncStatus.icon
                const isRefreshing = refreshingSheets.has(sheet.id)

                return (
                  <div key={sheet.id} className="border rounded-lg p-4 hover:border-blue-300 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <Database className="text-blue-600" size={20} />
                          <h3 className="font-medium text-gray-900">{sheet.title}</h3>
                          <div className={`flex items-center gap-1 ${syncStatus.color}`}>
                            <StatusIcon size={16} />
                            <span className="text-sm">{syncStatus.message}</span>
                          </div>
                        </div>
                        <div className="text-sm text-gray-600 ml-8">
                          {sheet.total_rows.toLocaleString()} rows • {sheet.columns.length} columns
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleRefreshSheet(sheet.id)}
                          disabled={isRefreshing}
                          className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white px-3 py-2 rounded-lg transition-colors text-sm flex items-center gap-2"
                          title="Sync data"
                        >
                          <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
                          Sync
                        </button>
                        <button
                          onClick={() => router.push(`/sheets/${sheet.id}`)}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg transition-colors text-sm flex items-center gap-2"
                          title="View details"
                        >
                          <Eye size={16} />
                          View
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Connect New Sheet Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">Connect Your Google Sheet</h2>
            </div>

            {/* Workflow Steps */}
            <div className="mb-6">
              <div className="grid md:grid-cols-3 gap-6">
                <div className="flex items-start gap-4">
                  <div className="bg-blue-100 rounded-full p-3 flex-shrink-0">
                    <Link2 className="text-blue-600" size={24} />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900 mb-2">1. Connect Sheet</h3>
                    <p className="text-sm text-gray-600">
                      Paste your Google Sheets URL below to securely connect and import your data.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="bg-green-100 rounded-full p-3 flex-shrink-0">
                    <Database className="text-green-600" size={24} />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900 mb-2">2. Import & Analyze</h3>
                    <p className="text-sm text-gray-600">
                      We'll analyze your data structure and save it to our local database for fast access.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="bg-purple-100 rounded-full p-3 flex-shrink-0">
                    <CheckCircle2 className="text-purple-600" size={24} />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900 mb-2">3. Create Charts</h3>
                    <p className="text-sm text-gray-600">
                      Get intelligent recommendations and create custom visualizations from your data.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Connection Form */}
            <div className="space-y-4">
              <div>
                <label htmlFor="sheetUrl" className="block text-sm font-medium text-gray-700 mb-2">
                  Google Sheets URL or ID
                </label>
                <input
                  id="sheetUrl"
                  type="text"
                  value={newSheetUrl}
                  onChange={(e) => setNewSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit or just the ID"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-sm text-blue-800 font-medium mb-2">📋 Requirements:</p>
                  <ul className="text-sm text-blue-700 space-y-1">
                    <li>• Must be a <strong>Google Sheets</strong> document (not Excel or other formats)</li>
                    <li>• Sheet must be accessible with your Google account or shared publicly</li>
                    <li>• For Excel files: Upload to Google Drive and convert to Google Sheets first</li>
                  </ul>
                </div>
              </div>

              <button
                onClick={handleAddSheet}
                disabled={!newSheetUrl.trim() || addingSheet}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {addingSheet ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    Connecting & Analyzing...
                  </>
                ) : (
                  <>
                    <Plus size={20} />
                    Connect & Analyze Sheet
                  </>
                )}
              </button>
            </div>

            {/* Help Section */}
            <div className="bg-blue-50 rounded-xl p-6">
              <h3 className="font-medium text-blue-900 mb-2">Need help getting your sheet URL?</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>1. Open your Google Sheet</li>
                <li>2. Click "Share" and make sure it's accessible with your account</li>
                <li>3. Copy the URL from your browser or use the sheet ID from the URL</li>
                <li>4. Paste it above and click "Connect & Analyze Sheet"</li>
              </ul>
            </div>
          </div>
        </div>

        {sheets.length === 0 && !loading && (
          <div className="mt-8 text-center">
            <p className="text-sm text-gray-500">
              Don't worry, you can always add more data sources later!
            </p>
          </div>
        )}
      </main>
    </div>
  )
}