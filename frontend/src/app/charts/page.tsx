'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { BarChart3, Plus, Trash2, Edit2, Save, X, ArrowLeft } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import DashboardLayout from '@/components/DashboardLayout'
import ChartRenderer from '@/components/ChartRenderer'
import ChatWidget from '@/components/ChatWidget'
import DataSourceSelector from '@/components/DataSourceSelector'
import SourceAwareRecommendations from '@/components/SourceAwareRecommendations'

interface Sheet {
  id: number
  title: string
  sheet_name: string
  columns: string[]
  sample_data: string[][]
  total_rows: number
}

interface Chart {
  id: number
  chart_name: string
  chart_type: string
  x_axis_column: string
  y_axis_column?: string
  chart_config: any
  created_at: string
  updated_at: string
}

interface ChartRecommendation {
  type: string
  title: string
  description: string
  x_axis: string
  y_axis?: string
  reason: string
}

interface DataSource {
  id: string
  type: 'sheet' | 'transformation' | 'project'
  name: string
  columns: string[]
  metadata: {
    total_rows?: number
    transformation_step?: string
    project_name?: string
    sheet_name?: string
  }
}

interface SourcedRecommendation extends ChartRecommendation {
  source: DataSource
}

const CHART_TYPES = [
  { value: 'bar', label: 'Bar Chart', description: 'Compare values across categories' },
  { value: 'line', label: 'Line Chart', description: 'Show trends over time or continuous data' },
  { value: 'pie', label: 'Pie Chart', description: 'Show proportions of a whole' },
  { value: 'scatter', label: 'Scatter Plot', description: 'Show relationship between two variables' },
  { value: 'histogram', label: 'Histogram', description: 'Show distribution of a single variable' }
]

const AGGREGATION_TYPES = [
  { value: 'count', label: 'Count', description: 'Count occurrences of each value' },
  { value: 'sum', label: 'Sum', description: 'Add up numeric values' },
  { value: 'avg', label: 'Average', description: 'Calculate mean of numeric values' },
  { value: 'min', label: 'Minimum', description: 'Find smallest numeric value' },
  { value: 'max', label: 'Maximum', description: 'Find largest numeric value' },
  { value: 'median', label: 'Median', description: 'Find middle value when sorted' }
]

interface SheetWithCharts extends Sheet {
  charts: Chart[]
}

export default function ChartsPage() {
  const { isAuthenticated, logout } = useAuth()
  const searchParams = useSearchParams()
  const router = useRouter()
  const sheetId = searchParams?.get('sheet')
  const projectId = searchParams?.get('project')
  
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [project, setProject] = useState<any>(null)
  const [projectData, setProjectData] = useState<any>(null)
  const [sheets, setSheets] = useState<SheetWithCharts[]>([])
  const [charts, setCharts] = useState<Chart[]>([])
  const [recommendations, setRecommendations] = useState<ChartRecommendation[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateChart, setShowCreateChart] = useState(false)
  const [editingChart, setEditingChart] = useState<Chart | null>(null)
  const [selectedSheetForCreation, setSelectedSheetForCreation] = useState<Sheet | null>(null)
  const [selectedDataSource, setSelectedDataSource] = useState<DataSource | null>(null)
  const [dataSources, setDataSources] = useState<DataSource[]>([])
  
  // Chart creation form state
  const [chartForm, setChartForm] = useState({
    chart_name: '',
    chart_type: 'bar',
    x_axis_column: '',
    y_axis_column: '',
    aggregation_type: 'count'
  })
  
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/')
      return
    }

    if (sheetId) {
      fetchSheetDetails()
      fetchCharts()
      fetchRecommendations()
    } else if (projectId) {
      fetchProjectDetails()
      fetchProjectCharts()
      fetchProjectRecommendations()
    } else {
      fetchAllSheetsWithCharts()
    }
  }, [sheetId, projectId, isAuthenticated, router])

  const fetchSheetDetails = async () => {
    if (!sheetId) return
    
    try {
      const response = await fetch(`http://localhost:8000/sheets/${sheetId}`)
      if (response.ok) {
        const data = await response.json()
        setSheet(data)
      } else {
        alert('Sheet not found')
        router.push('/home')
      }
    } catch (error) {
      console.error('Error fetching sheet:', error)
    }
  }

  const fetchCharts = async () => {
    if (!sheetId) return
    
    try {
      const response = await fetch(`http://localhost:8000/sheets/${sheetId}/charts`)
      if (response.ok) {
        const data = await response.json()
        setCharts(data.charts)
      }
    } catch (error) {
      console.error('Error fetching charts:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchRecommendations = async () => {
    if (!sheetId) return
    
    try {
      const response = await fetch(`http://localhost:8000/sheets/${sheetId}/recommendations`)
      if (response.ok) {
        const data = await response.json()
        setRecommendations(data.recommendations)
      }
    } catch (error) {
      console.error('Error fetching recommendations:', error)
    }
  }

  const fetchProjectDetails = async () => {
    if (!projectId) return
    
    try {
      const response = await fetch(`http://localhost:8000/projects/${projectId}`)
      if (response.ok) {
        const projectData = await response.json()
        setProject(projectData)

        const sheetsResponse = await fetch('http://localhost:8000/sheets/connected')
        if (sheetsResponse.ok) {
          const sheetsData = await sheetsResponse.json()
          const projectSheets = sheetsData.sheets.filter((sheet: any) => 
            projectData.sheet_ids.includes(sheet.id)
          )
          setSheets(projectSheets)
        }

        try {
          const dataResponse = await fetch(`http://localhost:8000/projects/${projectId}/data`)
          if (dataResponse.ok) {
            const data = await dataResponse.json()
            setProjectData(data)
          }
        } catch (error) {
          console.error('Error fetching project data:', error)
        }
      } else {
        alert('Project not found')
        router.push('/home')
      }
    } catch (error) {
      console.error('Error fetching project:', error)
    }
  }

  const fetchProjectCharts = async () => {
    if (!projectId) return
    
    try {
      const response = await fetch(`http://localhost:8000/projects/${projectId}/charts`)
      if (response.ok) {
        const data = await response.json()
        setCharts(data.charts)
      }
    } catch (error) {
      console.error('Error fetching project charts:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchProjectRecommendations = async () => {
    if (!projectId) return
    
    try {
      const response = await fetch(`http://localhost:8000/projects/${projectId}/recommendations`)
      if (response.ok) {
        const data = await response.json()
        setRecommendations(data.recommendations)
      }
    } catch (error) {
      console.error('Error fetching project recommendations:', error)
    }
  }

  const fetchAllSheetsWithCharts = async () => {
    try {
      const sheetsResponse = await fetch('http://localhost:8000/sheets/connected')
      if (!sheetsResponse.ok) {
        router.push('/')
        return
      }
      
      const sheetsData = await sheetsResponse.json()
      const allSheets: SheetWithCharts[] = []
      
      for (const sheet of sheetsData.sheets) {
        try {
          const chartsResponse = await fetch(`http://localhost:8000/sheets/${sheet.id}/charts`)
          if (chartsResponse.ok) {
            const chartsData = await chartsResponse.json()
            allSheets.push({
              ...sheet,
              charts: chartsData.charts
            })
          } else {
            allSheets.push({
              ...sheet,
              charts: []
            })
          }
        } catch (error) {
          console.error(`Error fetching charts for sheet ${sheet.id}:`, error)
          allSheets.push({
            ...sheet,
            charts: []
          })
        }
      }
      
      setSheets(allSheets)
    } catch (error) {
      console.error('Error fetching sheets with charts:', error)
    } finally {
      setLoading(false)
    }
  }

  const createChartFromRecommendation = (recommendation: ChartRecommendation & { source?: DataSource }) => {
    // Set the data source if provided
    if (recommendation.source) {
      setSelectedDataSource(recommendation.source)
    }
    
    // Determine appropriate default aggregation based on chart type and data
    let defaultAggregation = 'count'
    if (recommendation.y_axis) {
      // If we have a y-axis, default to sum for numeric data
      defaultAggregation = 'sum'
    }
    
    setChartForm({
      chart_name: recommendation.title,
      chart_type: recommendation.type,
      x_axis_column: recommendation.x_axis,
      y_axis_column: recommendation.y_axis || '',
      aggregation_type: defaultAggregation
    })
    setShowCreateChart(true)
  }

  const handleCreateChart = async () => {
    if (!chartForm.chart_name.trim() || !chartForm.x_axis_column) return
    
    setSaving(true)
    try {
      let response
      
      if (projectId) {
        const requestData = {
          project_id: parseInt(projectId),
          chart_name: chartForm.chart_name,
          chart_type: chartForm.chart_type,
          x_axis_column: chartForm.x_axis_column,
          y_axis_column: chartForm.y_axis_column || undefined,
          chart_config: {
            aggregation_type: chartForm.aggregation_type
          }
        }

        response = await fetch(`http://localhost:8000/projects/${projectId}/charts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestData),
        })
      } else {
        const targetSheetId = sheetId || selectedSheetForCreation?.id
        if (!targetSheetId) return
        
        const requestData = {
          sheet_id: parseInt(targetSheetId.toString()),
          chart_name: chartForm.chart_name,
          chart_type: chartForm.chart_type,
          x_axis_column: chartForm.x_axis_column,
          y_axis_column: chartForm.y_axis_column || undefined,
          chart_config: {
            aggregation_type: chartForm.aggregation_type
          }
        }

        response = await fetch('http://localhost:8000/charts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestData),
        })
      }

      if (response.ok) {
        if (sheetId) {
          await fetchCharts()
        } else if (projectId) {
          await fetchProjectCharts()
        } else {
          await fetchAllSheetsWithCharts()
        }
        setShowCreateChart(false)
        setSelectedSheetForCreation(null)
        resetForm()
      } else {
        const error = await response.json()
        alert(`Error creating chart: ${error.detail}`)
      }
    } catch (error) {
      alert('Error creating chart. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateChart = async () => {
    if (!editingChart || !chartForm.chart_name.trim() || !chartForm.x_axis_column) return
    
    setSaving(true)
    try {
      const requestData = {
        chart_name: chartForm.chart_name,
        chart_type: chartForm.chart_type,
        x_axis_column: chartForm.x_axis_column,
        y_axis_column: chartForm.y_axis_column || undefined,
        chart_config: {
          ...editingChart.chart_config,
          aggregation_type: chartForm.aggregation_type
        }
      }

      const response = await fetch(`http://localhost:8000/charts/${editingChart.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      })

      if (response.ok) {
        if (sheetId) {
          await fetchCharts()
        } else if (projectId) {
          await fetchProjectCharts()
        } else {
          await fetchAllSheetsWithCharts()
        }
        setEditingChart(null)
        resetForm()
      } else {
        const error = await response.json()
        alert(`Error updating chart: ${error.detail}`)
      }
    } catch (error) {
      alert('Error updating chart. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteChart = async (chartId: number) => {
    if (!confirm('Are you sure you want to delete this chart?')) return

    try {
      const response = await fetch(`http://localhost:8000/charts/${chartId}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        if (sheetId) {
          await fetchCharts()
        } else if (projectId) {
          await fetchProjectCharts()
        } else {
          await fetchAllSheetsWithCharts()
        }
      } else {
        const error = await response.json()
        alert(`Error deleting chart: ${error.detail}`)
      }
    } catch (error) {
      alert('Error deleting chart. Please try again.')
    }
  }

  const resetForm = () => {
    setChartForm({
      chart_name: '',
      chart_type: 'bar',
      x_axis_column: '',
      y_axis_column: '',
      aggregation_type: 'count'
    })
  }

  const startEditChart = (chart: Chart) => {
    setEditingChart(chart)
    setChartForm({
      chart_name: chart.chart_name,
      chart_type: chart.chart_type,
      x_axis_column: chart.x_axis_column,
      y_axis_column: chart.y_axis_column || '',
      aggregation_type: chart.chart_config?.aggregation_type || 'count'
    })
  }

  const cancelEdit = () => {
    setEditingChart(null)
    resetForm()
  }

  // Generate chart data based on sheet data and chart configuration
  const generateChartData = (chart: Chart, sheetData?: Sheet) => {
    const currentSheet = sheetData || sheet
    if (!currentSheet?.sample_data || !currentSheet.columns) return null

    const xColumnIndex = currentSheet.columns.indexOf(chart.x_axis_column)
    const yColumnIndex = chart.y_axis_column ? currentSheet.columns.indexOf(chart.y_axis_column) : -1
    const aggregationType = chart.chart_config?.aggregation_type || 'count'

    if (xColumnIndex === -1) return null

    const dataRows = currentSheet.sample_data.slice(1)
    
    const performAggregation = (values: number[], type: string) => {
      if (values.length === 0) return 0
      
      switch (type) {
        case 'sum':
          return values.reduce((a, b) => a + b, 0)
        case 'avg':
          return values.reduce((a, b) => a + b, 0) / values.length
        case 'min':
          return Math.min(...values)
        case 'max':
          return Math.max(...values)
        case 'median':
          const sorted = values.sort((a, b) => a - b)
          const mid = Math.floor(sorted.length / 2)
          return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
        case 'count':
        default:
          return values.length
      }
    }
    
    if (chart.chart_type === 'pie') {
      const grouped: { [key: string]: number[] } = {}
      
      dataRows.forEach(row => {
        const xValue = row[xColumnIndex]
        if (xValue) {
          if (!grouped[xValue]) grouped[xValue] = []
          
          if (yColumnIndex !== -1 && aggregationType !== 'count') {
            const yValue = parseFloat(row[yColumnIndex])
            if (!isNaN(yValue)) grouped[xValue].push(yValue)
          } else {
            grouped[xValue].push(1)
          }
        }
      })

      const labels = Object.keys(grouped)
      const data = labels.map(label => performAggregation(grouped[label], aggregationType))

      return {
        labels,
        datasets: [{
          data,
          backgroundColor: [
            '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
            '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
          ]
        }]
      }
    } else {
      const grouped: { [key: string]: number[] } = {}
      
      dataRows.forEach(row => {
        const xValue = row[xColumnIndex]
        if (xValue) {
          if (!grouped[xValue]) grouped[xValue] = []
          
          if (yColumnIndex !== -1 && aggregationType !== 'count') {
            const yValue = parseFloat(row[yColumnIndex])
            if (!isNaN(yValue)) grouped[xValue].push(yValue)
          } else {
            grouped[xValue].push(1)
          }
        }
      })

      const labels = Object.keys(grouped)
      const data = labels.map(label => performAggregation(grouped[label], aggregationType))
      
      let datasetLabel = chart.x_axis_column
      if (yColumnIndex !== -1 && aggregationType !== 'count') {
        datasetLabel = `${aggregationType.charAt(0).toUpperCase() + aggregationType.slice(1)} of ${chart.y_axis_column}`
      } else {
        datasetLabel = `${aggregationType.charAt(0).toUpperCase() + aggregationType.slice(1)} of ${chart.x_axis_column}`
      }

      return {
        labels,
        datasets: [{
          label: datasetLabel,
          data,
          backgroundColor: '#3B82F6',
          borderColor: '#3B82F6',
          fill: false
        }]
      }
    }
  }

  if (loading) {
    return (
      <DashboardLayout isAuthenticated={isAuthenticated} onLogout={logout}>
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading charts...</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  // Individual sheet view
  if (sheetId && sheet) {
    return (
      <DashboardLayout isAuthenticated={isAuthenticated} onLogout={logout}>
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/home')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Back to Home"
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">{sheet.title}</h1>
                <p className="text-gray-600 mt-1">Charts & Visualizations</p>
              </div>
            </div>
            <button
              onClick={() => setShowCreateChart(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
            >
              <Plus size={20} />
              Create Chart
            </button>
          </div>

          {/* Enhanced Chart Recommendations */}
          <SourceAwareRecommendations
            sheetId={sheet.id}
            dataSources={[{
              id: `sheet-${sheet.id}`,
              type: 'sheet',
              name: sheet.title,
              columns: sheet.columns || [],
              metadata: {
                total_rows: sheet.total_rows,
                sheet_name: sheet.sheet_name
              }
            }]}
            onCreateChart={(recommendation) => {
              if (recommendation.source) {
                setSelectedDataSource(recommendation.source)
              }
              createChartFromRecommendation(recommendation)
            }}
          />

          {/* Charts */}
          {charts.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg shadow-sm border">
              <BarChart3 className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No charts created yet</h3>
              <p className="text-gray-600 mb-6">
                Create your first chart from the {sheet.columns?.length || 0} available columns.
              </p>
              <button
                onClick={() => setShowCreateChart(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg inline-flex items-center gap-2 transition-colors"
              >
                <Plus size={20} />
                Create Your First Chart
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {charts.map((chart) => {
                const chartData = generateChartData(chart)
                return (
                  <div key={chart.id} className="bg-white rounded-lg shadow-sm border p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">{chart.chart_name}</h3>
                        <p className="text-sm text-gray-600 capitalize">{chart.chart_type} chart</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => startEditChart(chart)}
                          className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteChart(chart.id)}
                          className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    
                    <div className="h-64">
                      {chartData ? (
                        <ChartRenderer 
                          type={chart.chart_type} 
                          data={chartData}
                          options={{
                            responsive: true,
                            maintainAspectRatio: false
                          }}
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full text-gray-500">
                          No data available for this configuration
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </DashboardLayout>
    )
  }

  // Project charts view
  if (projectId && project) {
    return (
      <DashboardLayout isAuthenticated={isAuthenticated} onLogout={logout}>
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/home')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">{project.name}</h1>
                <p className="text-gray-600 mt-1">Charts & Visualizations</p>
              </div>
            </div>
            <button
              onClick={() => setShowCreateChart(true)}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
            >
              <Plus size={20} />
              Create Chart
            </button>
          </div>

          <div className="text-center py-12 bg-white rounded-lg shadow-sm border">
            <BarChart3 className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Project Charts</h3>
            <p className="text-gray-600">Project chart functionality available</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  // All charts view
  return (
    <DashboardLayout isAuthenticated={isAuthenticated} onLogout={logout}>
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <button
            onClick={() => router.push('/home')}
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-700 font-medium mb-4"
          >
            <ArrowLeft size={20} />
            Back to Dashboard
          </button>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">All Charts</h1>
          <p className="text-gray-600">View and manage all your charts organized by data source</p>
        </div>

        {sheets.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-lg shadow-sm border">
            <BarChart3 className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-xl font-medium text-gray-900 mb-2">No sheets connected yet</h3>
            <p className="text-gray-600 mb-6">
              Connect a Google Sheet to start creating charts and visualizations.
            </p>
            <button
              onClick={() => router.push('/dashboard')}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg inline-flex items-center gap-2 transition-colors"
            >
              <Plus size={20} />
              Connect Your First Sheet
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Enhanced Chart Recommendations for All Sources */}
            <SourceAwareRecommendations
              dataSources={sheets.map(sheet => ({
                id: `sheet-${sheet.id}`,
                type: 'sheet',
                name: sheet.title,
                columns: sheet.columns || [],
                metadata: {
                  total_rows: sheet.total_rows,
                  sheet_name: sheet.sheet_name
                }
              }))}
              onCreateChart={(recommendation) => {
                if (recommendation.source) {
                  setSelectedDataSource(recommendation.source)
                  // Find the corresponding sheet for creation
                  const sourceId = recommendation.source.id.replace('sheet-', '')
                  const sourceSheet = sheets.find(s => s.id.toString() === sourceId)
                  if (sourceSheet) {
                    setSelectedSheetForCreation(sourceSheet)
                  }
                }
                createChartFromRecommendation(recommendation)
              }}
            />

            {sheets.map((sheetData) => (
              <div key={sheetData.id} className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
                <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-8 py-6 border-b border-gray-200">
                  <div className="flex justify-between items-center">
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900 mb-1">{sheetData.title}</h2>
                      <p className="text-gray-600">
                        {sheetData.charts?.length || 0} chart{(sheetData.charts?.length || 0) !== 1 ? 's' : ''} • {sheetData.total_rows?.toLocaleString() || '0'} rows
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          setSelectedSheetForCreation(sheetData)
                          setShowCreateChart(true)
                        }}
                        className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
                      >
                        <Plus size={20} />
                        Create Chart
                      </button>
                      <button
                        onClick={() => router.push(`/charts?sheet=${sheetData.id}`)}
                        className="bg-white hover:bg-gray-50 text-gray-700 px-6 py-3 rounded-xl font-semibold border border-gray-300 hover:border-gray-400 transition-all duration-200 shadow-sm hover:shadow-md"
                      >
                        View Details
                      </button>
                    </div>
                  </div>
                </div>

                <div className="p-8">
                  {sheetData.charts.length === 0 ? (
                    <div className="text-center py-12">
                      <BarChart3 className="mx-auto h-8 w-8 text-gray-400 mb-3" />
                      <p className="text-gray-600 mb-4">No charts created yet for this sheet</p>
                      <button
                        onClick={() => {
                          setSelectedSheetForCreation(sheetData)
                          setShowCreateChart(true)
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg inline-flex items-center gap-2 transition-colors"
                      >
                        <Plus size={18} />
                        Create First Chart
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                      {sheetData.charts.map((chart) => {
                        const chartData = generateChartData(chart, sheetData)
                        return (
                          <div key={chart.id} className="bg-gray-50 rounded-xl p-6 border border-gray-200 hover:border-blue-300 hover:shadow-lg transition-all duration-200">
                            <div className="flex justify-between items-start mb-4">
                              <div>
                                <h4 className="text-lg font-semibold text-gray-900 mb-1">{chart.chart_name}</h4>
                                <p className="text-sm text-gray-600 capitalize">{chart.chart_type} chart</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => {
                                    setSelectedSheetForCreation(sheetData)
                                    startEditChart(chart)
                                  }}
                                  className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                >
                                  <Edit2 size={16} />
                                </button>
                                <button
                                  onClick={() => handleDeleteChart(chart.id)}
                                  className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>
                            
                            <div className="h-48 bg-white rounded-lg p-2">
                              {chartData ? (
                                <ChartRenderer 
                                  type={chart.chart_type} 
                                  data={chartData}
                                  options={{
                                    responsive: true,
                                    maintainAspectRatio: false
                                  }}
                                />
                              ) : (
                                <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                                  No data available
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create/Edit Chart Modal */}
        {(showCreateChart || editingChart) && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-semibold text-gray-900">
                    {editingChart ? 'Edit Chart' : 'Create New Chart'}
                  </h3>
                  <button
                    onClick={() => {
                      if (editingChart) {
                        cancelEdit()
                      } else {
                        setShowCreateChart(false)
                      }
                      setSelectedSheetForCreation(null)
                    }}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-6">
                  {/* Chart Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Chart Name
                    </label>
                    <input
                      type="text"
                      value={chartForm.chart_name}
                      onChange={(e) => setChartForm(prev => ({ ...prev, chart_name: e.target.value }))}
                      placeholder="Enter chart name"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Chart Type */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Chart Type
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {CHART_TYPES.map((type) => (
                        <div
                          key={type.value}
                          className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                            chartForm.chart_type === type.value
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-300 hover:border-gray-400'
                          }`}
                          onClick={() => setChartForm(prev => ({ ...prev, chart_type: type.value }))}
                        >
                          <p className="font-medium text-gray-900">{type.label}</p>
                          <p className="text-sm text-gray-600">{type.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Data Source Selection */}
                  <DataSourceSelector
                    projectId={projectId ? parseInt(projectId) : undefined}
                    onSourceSelect={(source) => {
                      setSelectedDataSource(source)
                      setChartForm(prev => ({
                        ...prev,
                        x_axis_column: '',
                        y_axis_column: ''
                      }))
                    }}
                    selectedSource={selectedDataSource || (sheet ? {
                      id: `sheet-${sheet.id}`,
                      type: 'sheet',
                      name: sheet.title,
                      columns: sheet.columns || [],
                      metadata: {
                        total_rows: sheet.total_rows,
                        sheet_name: sheet.sheet_name
                      }
                    } : selectedSheetForCreation ? {
                      id: `sheet-${selectedSheetForCreation.id}`,
                      type: 'sheet',
                      name: selectedSheetForCreation.title,
                      columns: selectedSheetForCreation.columns || [],
                      metadata: {
                        total_rows: selectedSheetForCreation.total_rows,
                        sheet_name: selectedSheetForCreation.sheet_name
                      }
                    } : null)}
                  />

                  {/* X-Axis Column */}
                  {(selectedDataSource || selectedSheetForCreation || sheet) && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        X-Axis Column
                      </label>
                      <select
                        value={chartForm.x_axis_column}
                        onChange={(e) => setChartForm(prev => ({ ...prev, x_axis_column: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select a column</option>
                        {(selectedDataSource?.columns || selectedSheetForCreation?.columns || sheet?.columns)?.map((column, idx) => (
                          <option key={idx} value={column}>{column}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Y-Axis Column */}
                  {!['pie', 'histogram'].includes(chartForm.chart_type) && (selectedDataSource || selectedSheetForCreation || sheet) && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Y-Axis Column (optional)
                      </label>
                      <select
                        value={chartForm.y_axis_column}
                        onChange={(e) => setChartForm(prev => ({ ...prev, y_axis_column: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Use X-axis column for aggregation</option>
                        {(selectedDataSource?.columns || selectedSheetForCreation?.columns || sheet?.columns)?.map((column, idx) => (
                          <option key={idx} value={column}>{column}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Aggregation Type */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Data Aggregation <span className="text-blue-600">(How to summarize the data)</span>
                    </label>
                    <select
                      value={chartForm.aggregation_type}
                      onChange={(e) => setChartForm(prev => ({ ...prev, aggregation_type: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {AGGREGATION_TYPES.map((aggType) => (
                        <option key={aggType.value} value={aggType.value}>
                          {aggType.label} - {aggType.description}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-8 pt-6 border-t">
                  <button
                    onClick={() => {
                      if (editingChart) {
                        cancelEdit()
                      } else {
                        setShowCreateChart(false)
                      }
                      setSelectedSheetForCreation(null)
                    }}
                    className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={editingChart ? handleUpdateChart : handleCreateChart}
                    disabled={!chartForm.chart_name.trim() || !chartForm.x_axis_column || saving}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-6 py-2 rounded-lg flex items-center gap-2 transition-colors"
                  >
                    <Save size={18} />
                    {saving ? 'Saving...' : editingChart ? 'Update Chart' : 'Create Chart'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <ChatWidget 
          context="All Charts View" 
          onChartCreated={fetchAllSheetsWithCharts}
        />
      </div>
    </DashboardLayout>
  )
}