'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Link2, Database, CheckCircle2, ArrowRight } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import Navigation from '@/components/Navigation'

export default function Dashboard() {
  const { isAuthenticated, logout } = useAuth()
  const router = useRouter()
  const [newSheetUrl, setNewSheetUrl] = useState('')
  const [addingSheet, setAddingSheet] = useState(false)

  const handleAddSheet = async () => {
    if (!newSheetUrl.trim()) return
    
    setAddingSheet(true)
    try {
      const response = await fetch('http://localhost:8000/sheets/analyze', {
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

  const handleGoToHome = () => {
    router.push('/home')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation isAuthenticated={isAuthenticated} onLogout={logout} />

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Connect Your Google Sheet</h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Import your Google Sheets data and get intelligent chart recommendations to visualize your insights.
          </p>
        </div>

        {/* Workflow Steps */}
        <div className="bg-white rounded-xl shadow-sm border p-8 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">How it works:</h2>
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
        <div className="bg-white rounded-xl shadow-sm border p-8 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Connect Your Sheet</h2>
          
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
        </div>

        {/* Help Section */}
        <div className="bg-blue-50 rounded-xl p-6 mb-8">
          <h3 className="font-medium text-blue-900 mb-2">Need help getting your sheet URL?</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>1. Open your Google Sheet</li>
            <li>2. Click "Share" and make sure it's accessible with your account</li>
            <li>3. Copy the URL from your browser or use the sheet ID from the URL</li>
            <li>4. Paste it above and click "Connect & Analyze Sheet"</li>
          </ul>
        </div>

        {/* Navigation to Home */}
        <div className="text-center">
          <button
            onClick={handleGoToHome}
            className="text-blue-600 hover:text-blue-700 font-medium inline-flex items-center gap-2"
          >
            <ArrowRight size={16} className="rotate-180" />
            View all connected sheets
          </button>
        </div>
      </main>
    </div>
  )
}