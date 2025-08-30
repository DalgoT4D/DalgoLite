'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { 
  Database, 
  BarChart3, 
  Plus, 
  CheckCircle, 
  AlertCircle, 
  RefreshCw,
  Calendar,
  TrendingUp,
  Users,
  Eye,
  ExternalLink,
  Sheet as SheetIcon,
  Trash2,
  Settings,
  Zap
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import Navigation from '@/components/Navigation'

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

interface TransformationProject {
  id: number
  name: string
  description: string
  mode: string
  sheet_ids: number[]
  created_at: string
  updated_at: string
}

export default function HomePage() {
  const { isAuthenticated, logout } = useAuth()
  const router = useRouter()
  const [sheets, setSheets] = useState<ConnectedSheet[]>([])
  const [projects, setProjects] = useState<TransformationProject[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshingSheets, setRefreshingSheets] = useState<Set<number>>(new Set())
  const [deletingSheets, setDeletingSheets] = useState<Set<number>>(new Set())
  const [deleteConfirmSheet, setDeleteConfirmSheet] = useState<ConnectedSheet | null>(null)
  const [stats, setStats] = useState({
    totalSheets: 0,
    totalProjects: 0,
    totalCharts: 0,
    totalDataRows: 0,
    lastSync: null as string | null
  })

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/')
      return
    }
    fetchConnectedSheets()
  }, [isAuthenticated, router])

  const fetchConnectedSheets = async () => {
    try {
      // Fetch sheets
      const sheetsResponse = await fetch('http://localhost:8000/sheets/connected')
      const sheetsData = sheetsResponse.ok ? await sheetsResponse.json() : { sheets: [] }
      setSheets(sheetsData.sheets)
      
      // Fetch transformation projects
      const projectsResponse = await fetch('http://localhost:8000/projects')
      const projectsData = projectsResponse.ok ? await projectsResponse.json() : { projects: [] }
      setProjects(projectsData.projects)
      
      // Calculate stats
      const sheetCharts = await Promise.all(
        sheetsData.sheets.map(async (sheet: ConnectedSheet) => {
          const chartsResponse = await fetch(`http://localhost:8000/sheets/${sheet.id}/charts`)
          if (chartsResponse.ok) {
            const chartsData = await chartsResponse.json()
            return chartsData.charts.length
          }
          return 0
        })
      )

      const projectCharts = await Promise.all(
        projectsData.projects.map(async (project: any) => {
          const chartsResponse = await fetch(`http://localhost:8000/projects/${project.id}/charts`)
          if (chartsResponse.ok) {
            const chartsData = await chartsResponse.json()
            return chartsData.charts.length
          }
          return 0
        })
      )
      
      setStats({
        totalSheets: sheetsData.sheets.length,
        totalProjects: projectsData.projects.length,
        totalCharts: sheetCharts.reduce((sum, count) => sum + count, 0) + projectCharts.reduce((sum, count) => sum + count, 0),
        totalDataRows: sheetsData.sheets.reduce((sum: number, sheet: ConnectedSheet) => sum + sheet.total_rows, 0),
        lastSync: sheetsData.sheets.length > 0 ? sheetsData.sheets[0].last_synced : null
      })
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleConnectSheet = () => {
    router.push('/dashboard')
  }

  const handleTransformSheets = () => {
    router.push('/transform')
  }

  const handleViewCharts = (sheetId: number) => {
    router.push(`/charts?sheet=${sheetId}`)
  }

  const handleRefreshSheet = async (sheet: ConnectedSheet) => {
    setRefreshingSheets(prev => new Set([...prev, sheet.id]))
    
    try {
      // Call the backend to resync the sheet data
      const response = await fetch(`http://localhost:8000/sheets/${sheet.id}/resync`, {
        method: 'POST',
      })
      
      if (response.ok) {
        // Refresh the connected sheets data to get updated info
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
        newSet.delete(sheet.id)
        return newSet
      })
    }
  }

  const handleDeleteSheet = async (sheet: ConnectedSheet) => {
    setDeletingSheets(prev => new Set([...prev, sheet.id]))
    
    try {
      const response = await fetch(`http://localhost:8000/sheets/${sheet.id}`, {
        method: 'DELETE',
      })
      
      if (response.ok) {
        // Remove the sheet from local state and refresh
        await fetchConnectedSheets()
        setDeleteConfirmSheet(null)
      } else {
        alert('Failed to delete sheet. Please try again.')
      }
    } catch (error) {
      console.error('Error deleting sheet:', error)
      alert('Error deleting sheet. Please try again.')
    } finally {
      setDeletingSheets(prev => {
        const newSet = new Set(prev)
        newSet.delete(sheet.id)
        return newSet
      })
    }
  }

  const confirmDeleteSheet = (sheet: ConnectedSheet) => {
    setDeleteConfirmSheet(sheet)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  const getSyncStatus = (lastSynced: string) => {
    // Backend now sends properly formatted UTC timestamps with Z suffix
    const syncTime = new Date(lastSynced)
    const now = new Date()
    const diffMinutes = (now.getTime() - syncTime.getTime()) / (1000 * 60)
    
    // Debug logging
    console.log('getSyncStatus debug:', {
      lastSynced,
      syncTime: syncTime.toISOString(),
      now: now.toISOString(),
      diffMinutes
    })
    
    if (diffMinutes < 2) {
      return { status: 'success', message: 'Just synced', icon: CheckCircle, color: 'text-green-600' }
    } else if (diffMinutes < 60) {
      return { status: 'success', message: `${Math.floor(diffMinutes)}m ago`, icon: CheckCircle, color: 'text-green-600' }
    } else if (diffMinutes < 1440) { // 24 hours
      return { status: 'warning', message: `${Math.floor(diffMinutes / 60)}h ago`, icon: AlertCircle, color: 'text-yellow-600' }
    } else {
      return { status: 'error', message: 'Needs sync', icon: AlertCircle, color: 'text-red-600' }
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation isAuthenticated={isAuthenticated} onLogout={logout} />
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading your data overview...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation isAuthenticated={isAuthenticated} onLogout={logout} />
      
      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-12">
          <div className="text-center mb-8">
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">Dashboard</h1>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Manage your connected Google Sheets and track your data analytics performance
            </p>
          </div>
          <div className="h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-full max-w-xs mx-auto"></div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl shadow-lg p-8 transform hover:scale-105 transition-all duration-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-bold mb-2">{stats.totalSheets}</p>
                <p className="text-blue-100 text-lg">Connected Sheets</p>
              </div>
              <div className="bg-white/20 rounded-full p-4">
                <Database className="text-white" size={32} />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-xl shadow-lg p-8 transform hover:scale-105 transition-all duration-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-bold mb-2">{stats.totalProjects}</p>
                <p className="text-orange-100 text-lg">Transform Projects</p>
              </div>
              <div className="bg-white/20 rounded-full p-4">
                <Zap className="text-white" size={32} />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-xl shadow-lg p-8 transform hover:scale-105 transition-all duration-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-bold mb-2">{stats.totalCharts}</p>
                <p className="text-green-100 text-lg">Total Charts</p>
              </div>
              <div className="bg-white/20 rounded-full p-4">
                <BarChart3 className="text-white" size={32} />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-xl shadow-lg p-8 transform hover:scale-105 transition-all duration-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-bold mb-2">{stats.totalDataRows.toLocaleString()}</p>
                <p className="text-purple-100 text-lg">Data Rows</p>
              </div>
              <div className="bg-white/20 rounded-full p-4">
                <TrendingUp className="text-white" size={32} />
              </div>
            </div>
          </div>
        </div>

        {/* Data Sources */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-8 py-6 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Data Sources</h2>
                <p className="text-gray-600">Manage your individual sheets and transformation projects</p>
              </div>
              <div className="flex items-center gap-3">
                {sheets.length >= 2 && (
                  <button
                    onClick={handleTransformSheets}
                    className="bg-gradient-to-r from-green-600 to-emerald-700 hover:from-green-700 hover:to-emerald-800 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-3 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
                  >
                    <Database size={22} />
                    New Transformation
                  </button>
                )}
                <button
                  onClick={handleConnectSheet}
                  className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-3 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
                >
                  <Plus size={22} />
                  Connect Sheet
                </button>
              </div>
            </div>
          </div>

          <div className="p-8">
            {sheets.length === 0 && projects.length === 0 ? (
              <div className="text-center py-16">
                <div className="bg-gradient-to-br from-blue-100 to-purple-100 rounded-full p-6 w-24 h-24 mx-auto mb-6">
                  <Database className="mx-auto h-12 w-12 text-blue-600" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-3">Ready to Get Started?</h3>
                <p className="text-gray-600 mb-8 text-lg max-w-md mx-auto">
                  Connect your first Google Sheet to unlock powerful data visualization and insights.
                </p>
                <button
                  onClick={handleConnectSheet}
                  className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8 py-4 rounded-xl font-semibold inline-flex items-center gap-3 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 text-lg"
                >
                  <Plus size={24} />
                  Connect Your First Sheet
                </button>
              </div>
            ) : (
              <div className="space-y-8">
                {/* Individual Sheets Section */}
                {sheets.length > 0 && (
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <SheetIcon className="text-blue-600" size={24} />
                      <h3 className="text-lg font-semibold text-gray-900">Individual Sheets</h3>
                      <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-medium">{sheets.length}</span>
                    </div>
                    
                    <div className="space-y-3">
                      {sheets.map((sheet) => {
                        const syncStatus = getSyncStatus(sheet.last_synced)
                        const StatusIcon = syncStatus.icon
                        const isRefreshing = refreshingSheets.has(sheet.id)
                        const isDeleting = deletingSheets.has(sheet.id)
                        
                        return (
                          <div key={sheet.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:bg-blue-50 transition-all duration-200">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3 flex-1">
                                <div className="bg-blue-600 text-white rounded p-1">
                                  <SheetIcon size={16} />
                                </div>
                                
                                <div className="flex-1">
                                  <div className="flex items-center gap-3 mb-1">
                                    <h4 className="font-bold text-gray-900">{sheet.title}</h4>
                                    <div className={`flex items-center gap-1 ${syncStatus.color}`}>
                                      <StatusIcon size={12} />
                                      <span className="text-xs">{syncStatus.message}</span>
                                    </div>
                                  </div>
                                  
                                  <div className="flex items-center gap-4 text-xs text-gray-600">
                                    <span>{sheet.total_rows.toLocaleString()} rows</span>
                                    <span>{sheet.columns.length} columns</span>
                                    <span>Last synced {formatDate(sheet.last_synced).split(',')[0]}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleRefreshSheet(sheet)}
                                  disabled={isRefreshing}
                                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white px-3 py-1 rounded text-sm font-medium transition-colors flex items-center gap-1"
                                >
                                  <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
                                  Sync
                                </button>
                                <button
                                  onClick={() => router.push(`/sheets/${sheet.id}`)}
                                  className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm font-medium transition-colors"
                                >
                                  Details
                                </button>
                                <button
                                  onClick={() => handleViewCharts(sheet.id)}
                                  className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded text-sm font-medium transition-colors"
                                >
                                  Charts
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Transformation Projects Section */}
                {projects.length > 0 && (
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <Database className="text-green-600" size={24} />
                      <h3 className="text-lg font-semibold text-gray-900">Transformation Projects</h3>
                      <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-medium">{projects.length}</span>
                    </div>
                    
                    <div className="space-y-3">
                      {projects.map((project) => (
                        <div key={project.id} className="bg-green-50 border border-green-200 rounded-lg p-4 hover:border-green-300 hover:bg-green-100 transition-all duration-200">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 flex-1">
                              <div className="bg-green-600 text-white rounded p-1">
                                <Database size={16} />
                              </div>
                              
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-1">
                                  <h4 className="font-bold text-gray-900">{project.name}</h4>
                                  <span className="bg-white text-green-800 px-2 py-1 rounded text-xs font-medium">
                                    {project.mode}
                                  </span>
                                </div>
                                
                                <div className="flex items-center gap-4 text-xs text-gray-600">
                                  <span>{project.description}</span>
                                  <span>{project.sheet_ids.length} sheets combined</span>
                                  <span>Created {formatDate(project.created_at).split(',')[0]}</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => router.push(`/projects/${project.id}`)}
                                className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm font-medium transition-colors"
                              >
                                Details
                              </button>
                              <button
                                onClick={() => router.push(`/charts?project=${project.id}`)}
                                className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded text-sm font-medium transition-colors"
                              >
                                Charts
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Delete Confirmation Modal */}
      {deleteConfirmSheet && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-red-100 rounded-full p-2">
                <Trash2 className="text-red-600" size={20} />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Delete Sheet</h3>
            </div>
            
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete <strong>"{deleteConfirmSheet.title}"</strong>? 
              This will permanently remove the sheet and all associated charts from the database. 
              This action cannot be undone.
            </p>
            
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirmSheet(null)}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteSheet(deleteConfirmSheet)}
                disabled={deletingSheets.has(deleteConfirmSheet.id)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  deletingSheets.has(deleteConfirmSheet.id)
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-red-600 hover:bg-red-700 text-white'
                }`}
              >
                {deletingSheets.has(deleteConfirmSheet.id) ? 'Deleting...' : 'Delete Sheet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}