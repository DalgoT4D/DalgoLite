'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Link2, Database, CheckCircle2, ArrowRight, RefreshCw, Eye, Trash2, AlertCircle } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { getApiUrl, API_ENDPOINTS } from '@/lib/config'
import DashboardLayout from '@/components/DashboardLayout'

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

export default function Dashboard() {
  const { isAuthenticated, logout } = useAuth()
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

  const fetchConnectedSheets = async () => {
    try {
      setLoading(true)
      const response = await fetch('http://localhost:8005/sheets/connected')
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
      const response = await fetch('http://localhost:8005/sheets/analyze', {
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
        // Refresh the connected sheets list
        await fetchConnectedSheets()
        // Clear the input
        setNewSheetUrl('')
        // Redirect to charts page for the new sheet
        router.push(`/charts?sheet=${result.sheet_id}`)
      } else {
        const error = await response.json()
        let errorMessage = error.detail || 'Unknown error occurred'
        
        // Provide more helpful error messages based on common issues
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
      const response = await fetch(`http://localhost:8005/sheets/${sheetId}/resync`, {
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
    <DashboardLayout isAuthenticated={isAuthenticated} onLogout={logout}>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Data Sources</h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Manage your connected Google Sheets and import new data sources.
          </p>
        </div>

        {/* Connected Sheets Section */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading your data sources...</p>
          </div>
        ) : sheets.length > 0 ? (
          <div className="bg-white rounded-xl shadow-sm border p-8 mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Connected Data Sources</h2>
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
        ) : null}

        {/* Connect New Sheet Section */}
        <div className="bg-white rounded-xl shadow-sm border p-8 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Connect New Google Sheet</h2>
          
          {/* Workflow Steps */}
          <div className="mb-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">How it works:</h3>
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
          <div className="bg-blue-50 rounded-xl p-6 mt-6">
            <h3 className="font-medium text-blue-900 mb-2">Need help getting your sheet URL?</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>1. Open your Google Sheet</li>
              <li>2. Click "Share" and make sure it's accessible with your account</li>
              <li>3. Copy the URL from your browser or use the sheet ID from the URL</li>
              <li>4. Paste it above and click "Connect & Analyze Sheet"</li>
            </ul>
          </div>
        </div>

        {/* Navigation to Home */}
        <div className="text-center">
          <button
            onClick={() => router.push('/home')}
            className="text-blue-600 hover:text-blue-700 font-medium inline-flex items-center gap-2"
          >
            <ArrowRight size={16} className="rotate-180" />
            View all data sources
          </button>
        </div>
      </div>
    </DashboardLayout>
  )
}