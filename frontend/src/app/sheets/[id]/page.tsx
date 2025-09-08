'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, RefreshCw, ExternalLink, BarChart3, Plus, Eye, Trash2, Settings } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import Navigation from '@/components/Navigation'

interface Sheet {
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

interface Chart {
  id: number
  chart_name: string
  chart_type: string
  x_axis_column: string
  y_axis_column: string
  created_at: string
}

export default function SheetDetailsPage({ params }: { params: { id: string } }) {
  const { isAuthenticated, logout } = useAuth()
  const router = useRouter()
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [charts, setCharts] = useState<Chart[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/')
      return
    }
    fetchSheetData()
  }, [isAuthenticated, router])

  const fetchSheetData = async () => {
    try {
      // Fetch sheet details
      const sheetResponse = await fetch(`http://localhost:8000/sheets/${params.id}`)
      if (!sheetResponse.ok) {
        router.push('/home')
        return
      }
      const sheetData = await sheetResponse.json()
      setSheet(sheetData)

      // Fetch charts for this sheet
      const chartsResponse = await fetch(`http://localhost:8000/sheets/${params.id}/charts`)
      if (chartsResponse.ok) {
        const chartsData = await chartsResponse.json()
        setCharts(chartsData.charts)
      }
    } catch (error) {
      console.error('Error fetching sheet data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = async () => {
    if (!sheet) return
    
    setRefreshing(true)
    try {
      const response = await fetch(`http://localhost:8000/sheets/${sheet.id}/resync`, {
        method: 'POST',
      })
      
      if (response.ok) {
        await fetchSheetData()
      } else {
        alert('Failed to refresh sheet data')
      }
    } catch (error) {
      console.error('Error refreshing sheet:', error)
      alert('Error refreshing sheet data')
    } finally {
      setRefreshing(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation isAuthenticated={isAuthenticated} onLogout={logout} />
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    )
  }

  if (!sheet) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation isAuthenticated={isAuthenticated} onLogout={logout} />
        <div className="text-center py-20">
          <p className="text-gray-600">Sheet not found</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation isAuthenticated={isAuthenticated} onLogout={logout} />
      
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/home')}
            className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium mb-4"
          >
            <ArrowLeft size={20} />
            Back to Dashboard
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{sheet.title}</h1>
              <p className="text-gray-600">Individual Google Sheet</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-4 py-2 rounded-lg flex items-center gap-2"
              >
                <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                {refreshing ? 'Syncing...' : 'Sync Data'}
              </button>
              <a
                href={sheet.spreadsheet_url}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg flex items-center gap-2"
              >
                <ExternalLink size={16} />
                Open in Google Sheets
              </a>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Sheet Information */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Sheet Information</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Sheet Name</label>
                  <p className="text-gray-900">{sheet.sheet_name}</p>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-500">Total Rows</label>
                  <p className="text-gray-900">{sheet.total_rows.toLocaleString()}</p>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-500">Columns</label>
                  <p className="text-gray-900">{sheet.columns.length}</p>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-500">Connected</label>
                  <p className="text-gray-900">{formatDate(sheet.connected_at)}</p>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-500">Last Synced</label>
                  <p className="text-gray-900">{formatDate(sheet.last_synced)}</p>
                </div>
              </div>
              
              {/* Columns Preview */}
              <div className="mt-6">
                <label className="text-sm font-medium text-gray-500 mb-2 block">Columns</label>
                <div className="flex flex-wrap gap-1">
                  {sheet.columns.map((column, idx) => (
                    <span key={idx} className="inline-block px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded border border-blue-200">
                      {column}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Charts Section */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <BarChart3 className="text-blue-600" size={24} />
                  <h2 className="text-lg font-semibold text-gray-900">Charts ({charts.length})</h2>
                </div>
                <button
                  onClick={() => router.push(`/charts?sheet=${sheet.id}`)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
                >
                  <Plus size={16} />
                  Create New Chart
                </button>
              </div>

              {charts.length === 0 ? (
                <div className="text-center py-8">
                  <BarChart3 className="mx-auto text-gray-400 mb-4" size={48} />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No charts yet</h3>
                  <p className="text-gray-600 mb-4">Create your first chart from this sheet's data</p>
                  <button
                    onClick={() => router.push(`/charts?sheet=${sheet.id}`)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
                  >
                    Create First Chart
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {charts.map((chart) => (
                    <div key={chart.id} className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-gray-900">{chart.chart_name}</h4>
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                          {chart.chart_type}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600 mb-3">
                        X: {chart.x_axis_column} {chart.y_axis_column && `• Y: ${chart.y_axis_column}`}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => router.push(`/charts/${chart.id}/view?from=sheets&sourceId=${sheet.id}`)}
                          className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                        >
                          View Chart
                        </button>
                        <button
                          onClick={() => router.push(`/charts?sheet=${sheet.id}&edit=${chart.id}`)}
                          className="text-gray-600 hover:text-gray-700 text-sm font-medium"
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}