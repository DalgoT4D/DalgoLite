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
  Eye,
  Sheet as SheetIcon,
  Trash2,
  Settings,
  Zap,
  ExternalLink,
  PieChart,
  Users,
  Activity,
  Play,
  Loader2
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
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

interface TransformationProject {
  id: number
  name: string
  description: string
  sheet_ids: number[]
  created_at: string
  updated_at: string
}

interface Chart {
  id: number
  chart_name: string
  chart_type: string
  sheet_id?: number
  project_id?: number
  created_at: string
  x_axis_column?: string
  y_axis_column?: string
}

export default function HomePage() {
  const { isAuthenticated, logout } = useAuth()
  const router = useRouter()
  const [sheets, setSheets] = useState<ConnectedSheet[]>([])
  const [projects, setProjects] = useState<TransformationProject[]>([])
  const [charts, setCharts] = useState<Chart[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshingSheets, setRefreshingSheets] = useState<Set<number>>(new Set())
  const [deletingSheets, setDeletingSheets] = useState<Set<number>>(new Set())
  const [deleteConfirmSheet, setDeleteConfirmSheet] = useState<ConnectedSheet | null>(null)
  const [deletingProjects, setDeletingProjects] = useState<Set<number>>(new Set())
  const [deleteConfirmProject, setDeleteConfirmProject] = useState<TransformationProject | null>(null)
  const [runningProjects, setRunningProjects] = useState<Set<number>>(new Set())
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
    fetchAllData()
  }, [isAuthenticated, router])

  const fetchAllData = async () => {
    try {
      setLoading(true)
      
      // Fetch sheets
      const sheetsResponse = await fetch('http://localhost:8005/sheets/connected')
      const sheetsData = sheetsResponse.ok ? await sheetsResponse.json() : { sheets: [] }
      setSheets(sheetsData.sheets)
      
      // Fetch transformation projects
      const projectsResponse = await fetch('http://localhost:8005/projects')
      const projectsData = projectsResponse.ok ? await projectsResponse.json() : { projects: [] }
      setProjects(projectsData.projects)
      
      // Fetch all charts
      await fetchAllCharts(sheetsData.sheets, projectsData.projects)
      
      // Calculate stats
      const totalChartCount = await calculateTotalCharts(sheetsData.sheets, projectsData.projects)
      const totalDataRows = sheetsData.sheets.reduce((sum: number, sheet: ConnectedSheet) => sum + sheet.total_rows, 0)
      
      setStats({
        totalSheets: sheetsData.sheets.length,
        totalProjects: projectsData.projects.length,
        totalCharts: totalChartCount,
        totalDataRows: totalDataRows,
        lastSync: sheetsData.sheets.length > 0 ? sheetsData.sheets[0].last_synced : null
      })
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchAllCharts = async (sheets: ConnectedSheet[], projects: TransformationProject[]) => {
    try {
      const allCharts: Chart[] = []

      // Fetch sheet charts
      for (const sheet of sheets) {
        try {
          const chartsResponse = await fetch(`http://localhost:8005/sheets/${sheet.id}/charts`)
          if (chartsResponse.ok) {
            const chartsData = await chartsResponse.json()
            allCharts.push(...chartsData.charts.map((chart: any) => ({ ...chart, sheet_id: sheet.id })))
          }
        } catch (error) {
          console.error(`Error fetching charts for sheet ${sheet.id}:`, error)
        }
      }

      // Fetch project charts  
      for (const project of projects) {
        try {
          const chartsResponse = await fetch(`http://localhost:8005/projects/${project.id}/charts`)
          if (chartsResponse.ok) {
            const chartsData = await chartsResponse.json()
            allCharts.push(...chartsData.charts.map((chart: any) => ({ ...chart, project_id: project.id })))
          }
        } catch (error) {
          console.error(`Error fetching charts for project ${project.id}:`, error)
        }
      }

      setCharts(allCharts)
    } catch (error) {
      console.error('Error fetching charts:', error)
    }
  }

  const calculateTotalCharts = async (sheets: ConnectedSheet[], projects: TransformationProject[]) => {
    try {
      const sheetCharts = await Promise.all(
        sheets.map(async (sheet: ConnectedSheet) => {
          const chartsResponse = await fetch(`http://localhost:8005/sheets/${sheet.id}/charts`)
          if (chartsResponse.ok) {
            const chartsData = await chartsResponse.json()
            return chartsData.charts.length
          }
          return 0
        })
      )

      const projectCharts = await Promise.all(
        projects.map(async (project: any) => {
          const chartsResponse = await fetch(`http://localhost:8005/projects/${project.id}/charts`)
          if (chartsResponse.ok) {
            const chartsData = await chartsResponse.json()
            return chartsData.charts.length
          }
          return 0
        })
      )
      
      return sheetCharts.reduce((sum, count) => sum + count, 0) + projectCharts.reduce((sum, count) => sum + count, 0)
    } catch (error) {
      console.error('Error calculating total charts:', error)
      return 0
    }
  }

  const handleConnectSheet = () => {
    router.push('/dashboard')
  }

  const handleCreateTransform = () => {
    router.push('/transform')
  }

  const handleCreateChart = () => {
    router.push('/charts')
  }

  const handleRefreshSheet = async (sheet: ConnectedSheet) => {
    setRefreshingSheets(prev => new Set([...Array.from(prev), sheet.id]))
    
    try {
      const response = await fetch(`http://localhost:8005/sheets/${sheet.id}/resync`, {
        method: 'POST',
      })
      
      if (response.ok) {
        await fetchAllData()
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
    setDeletingSheets(prev => new Set([...Array.from(prev), sheet.id]))
    
    try {
      const response = await fetch(`http://localhost:8005/sheets/${sheet.id}`, {
        method: 'DELETE',
      })
      
      if (response.ok) {
        await fetchAllData()
        setDeleteConfirmSheet(null)
      } else {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }))
        
        if (response.status === 400 && errorData.detail.includes('transformation projects')) {
          alert(errorData.detail)
        } else {
          alert('Failed to delete sheet. Please try again.')
        }
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

  const handleDeleteProject = async (project: TransformationProject) => {
    setDeletingProjects(prev => new Set([...Array.from(prev), project.id]))
    
    try {
      const response = await fetch(`http://localhost:8005/projects/${project.id}`, {
        method: 'DELETE',
      })
      
      if (response.ok) {
        await fetchAllData()
        setDeleteConfirmProject(null)
      } else {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }))
        alert(errorData.detail || 'Failed to delete project. Please try again.')
      }
    } catch (error) {
      console.error('Error deleting project:', error)
      alert('Error deleting project. Please try again.')
    } finally {
      setDeletingProjects(prev => {
        const newSet = new Set(prev)
        newSet.delete(project.id)
        return newSet
      })
    }
  }

  const confirmDeleteSheet = (sheet: ConnectedSheet) => {
    setDeleteConfirmSheet(sheet)
  }

  const confirmDeleteProject = (project: TransformationProject) => {
    setDeleteConfirmProject(project)
  }

  const handleRunProject = async (project: TransformationProject) => {
    setRunningProjects(prev => new Set([...Array.from(prev), project.id]))
    
    try {
      const response = await fetch(`http://localhost:8005/projects/${project.id}/execute-all`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to execute all transformations')
      }

      const result = await response.json()
      
      // Show success message
      alert(`✅ ${result.message}\n\nExecuted: ${result.executed_steps?.length || 0} operations\nFailed: ${result.failed_steps?.length || 0} operations`)

      // Refresh data to show updated stats
      await fetchAllData()
    } catch (error) {
      console.error('Error running project:', error)
      alert(`Error running project: ${error instanceof Error ? error.message : 'Unknown error occurred'}`)
    } finally {
      setRunningProjects(prev => {
        const newSet = new Set(prev)
        newSet.delete(project.id)
        return newSet
      })
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  const getSyncStatus = (lastSynced: string) => {
    const syncTime = new Date(lastSynced)
    const now = new Date()
    const diffMinutes = (now.getTime() - syncTime.getTime()) / (1000 * 60)
    
    if (diffMinutes < 2) {
      return { status: 'success', message: 'Just synced', icon: CheckCircle, color: 'text-green-600' }
    } else if (diffMinutes < 60) {
      return { status: 'success', message: `${Math.floor(diffMinutes)}m ago`, icon: CheckCircle, color: 'text-green-600' }
    } else if (diffMinutes < 1440) { 
      return { status: 'warning', message: `${Math.floor(diffMinutes / 60)}h ago`, icon: AlertCircle, color: 'text-yellow-600' }
    } else {
      return { status: 'error', message: 'Needs sync', icon: AlertCircle, color: 'text-red-600' }
    }
  }

  const getChartIcon = (chartType: string) => {
    switch (chartType) {
      case 'pie':
        return PieChart
      case 'bar':
      case 'line':
      case 'scatter':
      default:
        return BarChart3
    }
  }

  if (loading) {
    return (
      <DashboardLayout isAuthenticated={isAuthenticated} onLogout={logout}>
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading your dashboard...</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout isAuthenticated={isAuthenticated} onLogout={logout}>
      {/* Header */}
      <div className="mb-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">Dashboard</h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Manage your data sources, transformations, and charts in one place
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
              <p className="text-blue-100 text-lg">Data Sources</p>
            </div>
            <div className="bg-white/20 rounded-full p-4">
              <Database className="text-white" size={32} />
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-xl shadow-lg p-8 transform hover:scale-105 transition-all duration-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-bold mb-2">{stats.totalProjects}</p>
              <p className="text-green-100 text-lg">Transformations</p>
            </div>
            <div className="bg-white/20 rounded-full p-4">
              <Zap className="text-white" size={32} />
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-xl shadow-lg p-8 transform hover:scale-105 transition-all duration-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-bold mb-2">{stats.totalCharts}</p>
              <p className="text-purple-100 text-lg">Charts</p>
            </div>
            <div className="bg-white/20 rounded-full p-4">
              <BarChart3 className="text-white" size={32} />
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-xl shadow-lg p-8 transform hover:scale-105 transition-all duration-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-bold mb-2">{stats.totalDataRows.toLocaleString()}</p>
              <p className="text-orange-100 text-lg">Data Rows</p>
            </div>
            <div className="bg-white/20 rounded-full p-4">
              <TrendingUp className="text-white" size={32} />
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-8">
        {/* Data Sources Section */}
        <div>
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden h-fit">
            <div className="bg-gradient-to-r from-blue-50 to-blue-100 px-6 py-4 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <Database className="text-blue-600" size={24} />
                  <h2 className="text-xl font-bold text-gray-900">Data Sources</h2>
                </div>
                <button
                  onClick={handleConnectSheet}
                  className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-lg transition-colors"
                  title="Connect new sheet"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>

            <div className="p-6">
              {sheets.length === 0 ? (
                <div className="text-center py-8">
                  <div className="bg-blue-100 rounded-full p-4 w-16 h-16 mx-auto mb-4">
                    <SheetIcon className="mx-auto h-8 w-8 text-blue-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No Data Sources</h3>
                  <p className="text-gray-600 mb-4">Connect your first Google Sheet to get started.</p>
                  <button
                    onClick={handleConnectSheet}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                  >
                    Connect Sheet
                  </button>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <SheetIcon className="text-green-600" size={20} />
                    <h3 className="font-semibold text-gray-900">Google Sheets</h3>
                    <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-medium">
                      {sheets.length}
                    </span>
                  </div>
                  
                  <div className="space-y-3 max-h-80 overflow-y-auto">
                    {sheets.map((sheet) => {
                      const syncStatus = getSyncStatus(sheet.last_synced)
                      const StatusIcon = syncStatus.icon
                      const isRefreshing = refreshingSheets.has(sheet.id)
                      const isDeleting = deletingSheets.has(sheet.id)
                      
                      return (
                        <div key={sheet.id} className="bg-gray-50 border border-gray-200 rounded-lg p-3 hover:border-blue-300 transition-colors">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-medium text-gray-900 text-sm truncate">{sheet.title}</h4>
                            <div className={`flex items-center gap-1 ${syncStatus.color}`}>
                              <StatusIcon size={12} />
                              <span className="text-xs">{syncStatus.message}</span>
                            </div>
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <div className="text-xs text-gray-600">
                              {sheet.columns.length} columns
                            </div>
                            
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleRefreshSheet(sheet)}
                                disabled={isRefreshing}
                                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white p-1 rounded transition-colors"
                                title="Sync data"
                              >
                                <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
                              </button>
                              <button
                                onClick={() => router.push(`/sheets/${sheet.id}`)}
                                className="bg-blue-600 hover:bg-blue-700 text-white p-1 rounded transition-colors"
                                title="View details"
                              >
                                <Eye size={12} />
                              </button>
                              <button
                                onClick={() => confirmDeleteSheet(sheet)}
                                disabled={isDeleting}
                                className="bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white p-1 rounded transition-colors"
                                title="Delete sheet"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Transformations Section */}
        <div>
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden h-fit">
            <div className="bg-gradient-to-r from-green-50 to-green-100 px-6 py-4 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <Zap className="text-green-600" size={24} />
                  <h2 className="text-xl font-bold text-gray-900">Transformations</h2>
                </div>
                <button
                  onClick={handleCreateTransform}
                  disabled={sheets.length === 0}
                  className={`p-2 rounded-lg transition-colors ${
                    sheets.length === 0 
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                      : 'bg-green-600 hover:bg-green-700 text-white'
                  }`}
                  title={sheets.length === 0 ? 'Connect a sheet first' : 'Create new transformation'}
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>

            <div className="p-6">
              {projects.length === 0 ? (
                <div className="text-center py-8">
                  <div className="bg-green-100 rounded-full p-4 w-16 h-16 mx-auto mb-4">
                    <Zap className="mx-auto h-8 w-8 text-green-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No Transformations</h3>
                  <p className="text-gray-600 mb-4">Create your first data transformation project.</p>
                  <button
                    onClick={handleCreateTransform}
                    disabled={sheets.length === 0}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      sheets.length === 0 
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                        : 'bg-green-600 hover:bg-green-700 text-white'
                    }`}
                  >
                    Create Transform
                  </button>
                </div>
              ) : (
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {projects.map((project) => (
                    <div key={project.id} className="bg-green-50 border border-green-200 rounded-lg p-3 hover:border-green-300 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-gray-900 text-sm truncate">{project.name}</h4>
                      </div>
                      
                      <p className="text-xs text-gray-600 mb-2 line-clamp-2">{project.description}</p>
                      
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-gray-600">
                          {project.sheet_ids.length} sheets • Created {formatDate(project.created_at).split(',')[0]}
                        </div>
                        
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleRunProject(project)}
                            disabled={runningProjects.has(project.id)}
                            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white p-1 rounded transition-colors"
                            title="Run all transformations"
                          >
                            {runningProjects.has(project.id) ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Play size={12} />
                            )}
                          </button>
                          <button
                            onClick={() => router.push(`/transform/${project.id}/canvas`)}
                            className="bg-green-600 hover:bg-green-700 text-white p-1 rounded transition-colors"
                            title="Open canvas"
                          >
                            <Settings size={12} />
                          </button>
                          <button
                            onClick={() => confirmDeleteProject(project)}
                            disabled={deletingProjects.has(project.id)}
                            className="bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white p-1 rounded transition-colors"
                            title="Delete project"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Charts Section */}
        <div>
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden h-fit">
            <div className="bg-gradient-to-r from-purple-50 to-purple-100 px-6 py-4 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <BarChart3 className="text-purple-600" size={24} />
                  <h2 className="text-xl font-bold text-gray-900">Charts</h2>
                </div>
                <button
                  onClick={handleCreateChart}
                  className="bg-purple-600 hover:bg-purple-700 text-white p-2 rounded-lg transition-colors"
                  title="Create new chart"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>

            <div className="p-6">
              {charts.length === 0 ? (
                <div className="text-center py-8">
                  <div className="bg-purple-100 rounded-full p-4 w-16 h-16 mx-auto mb-4">
                    <BarChart3 className="mx-auto h-8 w-8 text-purple-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No Charts</h3>
                  <p className="text-gray-600 mb-4">Create your first chart to visualize your data.</p>
                  <button
                    onClick={handleCreateChart}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                  >
                    Create Chart
                  </button>
                </div>
              ) : (
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {charts.map((chart) => {
                    const ChartIcon = getChartIcon(chart.chart_type)
                    const isSheetChart = chart.sheet_id !== undefined
                    const sourceSheet = isSheetChart ? sheets.find(s => s.id === chart.sheet_id) : null
                    const sourceProject = !isSheetChart ? projects.find(p => p.id === chart.project_id) : null
                    
                    return (
                      <div key={chart.id} className="bg-purple-50 border border-purple-200 rounded-lg p-3 hover:border-purple-300 transition-colors">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <ChartIcon size={14} className="text-purple-600" />
                            <h4 className="font-medium text-gray-900 text-sm truncate">{chart.chart_name}</h4>
                          </div>
                          <span className="text-xs text-gray-500 capitalize">{chart.chart_type}</span>
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <div className="text-xs text-gray-600">
                            {isSheetChart && sourceSheet ? `Sheet: ${sourceSheet.title}` : ''}
                            {!isSheetChart && sourceProject ? `Project: ${sourceProject.name}` : ''}
                          </div>
                          
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => router.push(`/charts?${isSheetChart ? `sheet=${chart.sheet_id}` : `project=${chart.project_id}`}`)}
                              className="bg-purple-600 hover:bg-purple-700 text-white p-1 rounded transition-colors"
                              title="View chart"
                            >
                              <Eye size={12} />
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal for Sheets */}
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

      {/* Delete Confirmation Modal for Projects */}
      {deleteConfirmProject && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-red-100 text-red-600 p-2 rounded-full">
                <Trash2 size={20} />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Delete Project</h3>
            </div>
            
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete project <strong>"{deleteConfirmProject.name}"</strong>? 
              This will permanently remove the project and all associated transformations and charts from the database. 
              This action cannot be undone.
            </p>
            
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirmProject(null)}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteProject(deleteConfirmProject)}
                disabled={deletingProjects.has(deleteConfirmProject.id)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  deletingProjects.has(deleteConfirmProject.id)
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-red-600 hover:bg-red-700 text-white'
                }`}
              >
                {deletingProjects.has(deleteConfirmProject.id) ? 'Deleting...' : 'Delete Project'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}