'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { BarChart3, Plus, Trash2, Edit2, Save, X, ArrowLeft, SidebarOpen, Filter, Lightbulb, Eye } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import DashboardLayout from '@/components/DashboardLayout'
import ChartRenderer from '@/components/ChartRenderer'
import ChatBot from '@/components/chat/ChatBot'
import { getApiUrl, API_ENDPOINTS } from '@/lib/config'

interface ChartDisplayProps {
  chartId: number
}

function ChartDisplay({ chartId }: ChartDisplayProps) {
  const [chartData, setChartData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const chartRef = useRef<any>(null)

  useEffect(() => {
    const fetchChartData = async () => {
      try {
        const response = await fetch(getApiUrl(`/charts/${chartId}/data`))
        if (response.ok) {
          const data = await response.json()
          setChartData(data)
        } else {
          setError('Failed to load chart data')
        }
      } catch (error) {
        setError('Error loading chart')
      } finally {
        setLoading(false)
      }
    }

    fetchChartData()
  }, [chartId])


  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500 text-sm">Loading...</div>
      </div>
    )
  }

  if (error || !chartData) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500 text-sm">{error || 'Unable to load chart'}</div>
      </div>
    )
  }

  return (
    <ChartRenderer 
      ref={chartRef}
      type={chartData.chart_type}
      data={chartData.data}
      options={{
        ...chartData.options,
        backgroundColor: '#ffffff',
        plugins: {
          ...chartData.options?.plugins,
          legend: {
            ...chartData.options?.plugins?.legend,
            labels: {
              ...chartData.options?.plugins?.legend?.labels,
              color: '#374151', // Gray-700 for text
            },
          },
        },
        scales: {
          ...chartData.options?.scales,
          x: {
            ...chartData.options?.scales?.x,
            ticks: {
              ...chartData.options?.scales?.x?.ticks,
              color: '#6B7280', // Gray-500
            },
            grid: {
              ...chartData.options?.scales?.x?.grid,
              color: '#E5E7EB', // Gray-200
            },
          },
          y: {
            ...chartData.options?.scales?.y,
            ticks: {
              ...chartData.options?.scales?.y?.ticks,
              color: '#6B7280', // Gray-500
            },
            grid: {
              ...chartData.options?.scales?.y?.grid,
              color: '#E5E7EB', // Gray-200
            },
          },
        },
      }}
      title={chartData.chart_name}
      selectedColumns={chartData.chart_config?.selected_columns}
      chartConfig={chartData.chart_config}
    />
  )
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
  source_type: string
  source_name: string
  source_id: number
}

interface DataSource {
  id: string
  type: 'sheet' | 'transformation' | 'join' | 'qualitative'
  name: string
  display_name: string
  columns: string[]
  metadata: {
    total_rows?: number
    project_id?: number
    project_name?: string
    [key: string]: any
  }
}

interface ChartRecommendation {
  type: string
  title: string
  description: string
  x_axis: string
  y_axis?: string
  reason: string
}

const CHART_TYPES = [
  { value: 'bar', label: 'Bar Chart', description: 'Compare values across categories' },
  { value: 'line', label: 'Line Chart', description: 'Show trends over time or continuous data' },
  { value: 'pie', label: 'Pie Chart', description: 'Show proportions of a whole' },
  { value: 'scatter', label: 'Scatter Plot', description: 'Show relationship between two variables' },
  { value: 'histogram', label: 'Histogram', description: 'Show distribution of a single variable' },
  { value: 'table', label: 'Table', description: 'Display data in rows and columns' },
  { value: 'qualitative_cards', label: 'Qualitative Cards', description: 'Navigate qualitative text with supporting metrics' }
]

const AGGREGATION_TYPES = [
  { value: 'count', label: 'Count', description: 'Count occurrences of each value' },
  { value: 'sum', label: 'Sum', description: 'Add up numeric values' },
  { value: 'avg', label: 'Average', description: 'Calculate mean of numeric values' },
  { value: 'min', label: 'Minimum', description: 'Find smallest numeric value' },
  { value: 'max', label: 'Maximum', description: 'Find largest numeric value' },
  { value: 'median', label: 'Median', description: 'Find middle value when sorted' }
]

const METRIC_FORMAT_OPTIONS = [
  { value: 'auto', label: 'Default' },
  { value: 'integer', label: 'Integer' },
  { value: 'decimal', label: 'Decimal (2 places)' },
  { value: 'percentage', label: 'Percentage' },
  { value: 'currency', label: 'Currency (USD)' }
]

export default function UnifiedChartsPage() {
  const { isAuthenticated, logout } = useAuth()
  const router = useRouter()
  
  const [charts, setCharts] = useState<Chart[]>([])
  const [dataSources, setDataSources] = useState<DataSource[]>([])
  const [recommendations, setRecommendations] = useState<ChartRecommendation[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateChart, setShowCreateChart] = useState(false)
  const [showRecommendations, setShowRecommendations] = useState(false)
  const [editingChart, setEditingChart] = useState<Chart | null>(null)
  const [selectedDataSource, setSelectedDataSource] = useState<DataSource | null>(null)
  const [recommendationSource, setRecommendationSource] = useState<DataSource | null>(null)
  const [loadingRecommendations, setLoadingRecommendations] = useState(false)
  
  // Chart creation form state
  const [chartForm, setChartForm] = useState({
    chart_name: '',
    chart_type: 'bar',
    x_axis_column: '',
    y_axis_column: '',
    aggregation_type: 'count',
    selected_columns: [] as string[]
  })
  const createEmptyQualitativeForm = () => ({
    unique_column: '',
    qualitative_column: '',
    metrics: [
      { column: '', label: '', formatting: 'auto' as string }
    ]
  })
  const [qualitativeForm, setQualitativeForm] = useState(createEmptyQualitativeForm)
  
  const [saving, setSaving] = useState(false)
  const qualitativeConfigReady = Boolean(
    qualitativeForm.unique_column &&
    qualitativeForm.qualitative_column
  )

  const updateMetric = (index: number, field: 'column' | 'label' | 'formatting', value: string) => {
    setQualitativeForm(prev => {
      const metrics = prev.metrics.map((metric, idx) => {
        if (idx === index) {
          return { ...metric, [field]: value }
        }
        return metric
      })
      return { ...prev, metrics }
    })
  }

  const addMetric = () => {
    setQualitativeForm(prev => {
      if (prev.metrics.length >= 2) {
        return prev
      }
      return {
        ...prev,
        metrics: [...prev.metrics, { column: '', label: '', formatting: 'auto' }]
      }
    })
  }

  const removeMetric = (index: number) => {
    setQualitativeForm(prev => {
      const metrics = prev.metrics.filter((_, idx) => idx !== index)
      return { ...prev, metrics }
    })
  }

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/')
      return
    }
    
    fetchCharts()
    fetchDataSources()
  }, [isAuthenticated, router])

  const fetchCharts = async () => {
    try {
      const response = await fetch(getApiUrl('/charts'))
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

  const fetchDataSources = async () => {
    try {
      const response = await fetch(getApiUrl('/data-sources'))
      if (response.ok) {
        const data = await response.json()
        setDataSources(data.data_sources)
      }
    } catch (error) {
      console.error('Error fetching data sources:', error)
    }
  }

  const fetchRecommendations = async (source: DataSource) => {
    if (!source) return
    
    setLoadingRecommendations(true)
    try {
      let endpoint = ''
      
      if (source.type === 'sheet') {
        const sheetId = source.id.replace('sheet-', '')
        endpoint = getApiUrl(`/sheets/${sheetId}/recommendations`)
      } else if (source.type === 'transformation') {
        if (source.id.startsWith('join-')) {
          const joinId = source.id.replace('join-', '')
          endpoint = getApiUrl(`/joins/${joinId}/recommendations`)
        } else {
          const stepId = source.id.replace('transform-', '')
          endpoint = getApiUrl(`/ai-transformations/${stepId}/recommendations`)
        }
      } else if (source.type === 'join') {
        // For joins, we might need to create a generic recommendation endpoint
        // For now, we'll create basic recommendations based on available columns
        const basicRecommendations = source.columns.map((col, idx) => ({
          type: idx % 2 === 0 ? 'bar' : 'pie',
          title: `${col} Analysis`,
          description: `Analyze ${col} data distribution`,
          x_axis: col,
          y_axis: idx % 3 === 0 && source.columns[idx + 1] ? source.columns[idx + 1] : undefined,
          reason: `Show distribution of ${col} values`
        })).slice(0, 3) // Limit to 3 recommendations
        
        setRecommendations(basicRecommendations)
        setLoadingRecommendations(false)
        return
      }

      const response = await fetch(endpoint)
      if (response.ok) {
        const data = await response.json()
        setRecommendations(data.recommendations || [])
      }
    } catch (error) {
      console.error('Error fetching recommendations:', error)
      setRecommendations([])
    } finally {
      setLoadingRecommendations(false)
    }
  }

  const handleCreateChart = async () => {
    // For table and qualitative cards, handle requirements separately
    if (!chartForm.chart_name.trim() || !selectedDataSource) return

    const isQualitativeCards = chartForm.chart_type === 'qualitative_cards'

    if (!isQualitativeCards && chartForm.chart_type !== 'table' && !chartForm.x_axis_column) return

    let activeMetrics: { column: string; label: string; formatting: string }[] = []
    if (isQualitativeCards) {
      if (!qualitativeForm.unique_column || !qualitativeForm.qualitative_column) return
      activeMetrics = qualitativeForm.metrics
        .map(metric => ({
          column: metric.column?.trim() || '',
          label: metric.label?.trim() || '',
          formatting: metric.formatting || 'auto'
        }))
        .filter(metric => metric.column)
        .slice(0, 2)
    }

    setSaving(true)
    try {
      // Extract numeric ID from prefixed string
      let extractedSourceId: string
      if (selectedDataSource.id.startsWith('sheet-')) {
        extractedSourceId = selectedDataSource.id.replace('sheet-', '')
      } else if (selectedDataSource.id.startsWith('join-')) {
        extractedSourceId = selectedDataSource.id.replace('join-', '')
      } else if (selectedDataSource.id.startsWith('transform-')) {
        extractedSourceId = selectedDataSource.id.replace('transform-', '')
      } else if (selectedDataSource.id.startsWith('qualitative-')) {
        extractedSourceId = selectedDataSource.id.replace('qualitative-', '')
      } else if (selectedDataSource.id.startsWith('project-')) {
        extractedSourceId = selectedDataSource.id.replace('project-', '')
      } else {
        extractedSourceId = selectedDataSource.id
      }

      const quantitativeColumns = activeMetrics.map(metric => metric.column)
      const quantitativeLabels = activeMetrics.map(metric => metric.label || metric.column)
      const valueFormatting = activeMetrics.reduce((acc, metric) => {
        if (metric.formatting && metric.formatting !== 'auto') {
          acc[metric.column] = metric.formatting
        }
        return acc
      }, {} as Record<string, string>)

      const requestData = {
        chart_name: chartForm.chart_name,
        chart_type: chartForm.chart_type,
        x_axis_column: isQualitativeCards ? qualitativeForm.unique_column : chartForm.x_axis_column,
        y_axis_column: isQualitativeCards ? undefined : chartForm.y_axis_column || undefined,
        chart_config: isQualitativeCards
          ? {
              unique_column: qualitativeForm.unique_column,
              qualitative_column: qualitativeForm.qualitative_column,
              quantitative_columns: quantitativeColumns,
              quantitative_labels: quantitativeLabels,
              value_formatting: valueFormatting
            }
          : {
              aggregation_type: chartForm.aggregation_type,
              selected_columns: chartForm.chart_type === 'table' ? chartForm.selected_columns : undefined
            },
        source_type: selectedDataSource.type,
        source_id: extractedSourceId
        // No project_id needed - unified charts are project-agnostic!
      }

      console.log('DEBUG: About to send request:', requestData)
      
      const response = await fetch(getApiUrl('/charts/unified'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      })

      if (response.ok) {
        await fetchCharts()
        setShowCreateChart(false)
        resetForm()
      } else {
        const error = await response.json()
        console.error('Chart creation error:', error)
        const errorMessage = typeof error.detail === 'string' 
          ? error.detail 
          : JSON.stringify(error.detail || error)
        alert(`Error creating chart: ${errorMessage}`)
      }
    } catch (error) {
      console.error('Chart creation error:', error)
      alert(`Error creating chart: ${error instanceof Error ? error.message : 'Please try again.'}`)
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateChart = async () => {
    if (!editingChart || !chartForm.chart_name.trim()) return

    const isQualitativeCards = chartForm.chart_type === 'qualitative_cards'
    if (!isQualitativeCards && chartForm.chart_type !== 'table' && !chartForm.x_axis_column) return

    let activeMetrics: { column: string; label: string; formatting: string }[] = []
    if (isQualitativeCards) {
      if (!qualitativeForm.unique_column || !qualitativeForm.qualitative_column) return
      activeMetrics = qualitativeForm.metrics
        .map(metric => ({
          column: metric.column?.trim() || '',
          label: metric.label?.trim() || '',
          formatting: metric.formatting || 'auto'
        }))
        .filter(metric => metric.column)
        .slice(0, 2)
    }

    setSaving(true)
    try {
      const quantitativeColumns = activeMetrics.map(metric => metric.column)
      const quantitativeLabels = activeMetrics.map(metric => metric.label || metric.column)
      const valueFormatting = activeMetrics.reduce((acc, metric) => {
        if (metric.formatting && metric.formatting !== 'auto') {
          acc[metric.column] = metric.formatting
        }
        return acc
      }, {} as Record<string, string>)

      const baseConfig = { ...editingChart.chart_config }

      const requestData = {
        chart_name: chartForm.chart_name,
        chart_type: chartForm.chart_type,
        x_axis_column: isQualitativeCards ? qualitativeForm.unique_column : chartForm.x_axis_column,
        y_axis_column: isQualitativeCards ? undefined : chartForm.y_axis_column || undefined,
        chart_config: isQualitativeCards
          ? {
              ...baseConfig,
              unique_column: qualitativeForm.unique_column,
              qualitative_column: qualitativeForm.qualitative_column,
              quantitative_columns: quantitativeColumns,
              quantitative_labels: quantitativeLabels,
              value_formatting: valueFormatting
            }
          : {
              ...baseConfig,
              aggregation_type: chartForm.aggregation_type,
              selected_columns: chartForm.chart_type === 'table' ? chartForm.selected_columns : undefined
            }
      }

      const response = await fetch(getApiUrl(`/charts/${editingChart.id}`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      })

      if (response.ok) {
        await fetchCharts()
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
      const response = await fetch(getApiUrl(`/charts/${chartId}`), {
        method: 'DELETE',
      })

      if (response.ok) {
        await fetchCharts()
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
      aggregation_type: 'count',
      selected_columns: []
    })
    setSelectedDataSource(null)
    setQualitativeForm(createEmptyQualitativeForm())
  }

  const startEditChart = (chart: Chart) => {
    setEditingChart(chart)
    
    // Find the data source for this chart
    const sourceType = chart.chart_config?.source_type || chart.source_type
    const sourceId = chart.chart_config?.source_id || chart.source_id
    const dataSource = dataSources.find(ds => 
      ds.type === sourceType && ds.id === `${sourceType}-${sourceId}`
    )
    
    if (dataSource) {
      setSelectedDataSource(dataSource)
    }
    
    setChartForm({
      chart_name: chart.chart_name,
      chart_type: chart.chart_type,
      x_axis_column: chart.x_axis_column,
      y_axis_column: chart.y_axis_column || '',
      aggregation_type: chart.chart_config?.aggregation_type || 'count',
      selected_columns: chart.chart_config?.selected_columns || []
    })

    if (chart.chart_type === 'qualitative_cards') {
      const quantitativeColumns = chart.chart_config?.quantitative_columns || []
      const quantitativeLabels = chart.chart_config?.quantitative_labels || []
      const formatting = chart.chart_config?.value_formatting || {}

      const metrics = quantitativeColumns.length > 0
        ? quantitativeColumns.slice(0, 2).map((col: string, idx: number) => ({
            column: col,
            label: quantitativeLabels[idx] || '',
            formatting: formatting[col] || 'auto'
          }))
        : [{ column: '', label: '', formatting: 'auto' }]

      setQualitativeForm({
        unique_column: chart.chart_config?.unique_column || '',
        qualitative_column: chart.chart_config?.qualitative_column || '',
        metrics
      })
    } else {
      setQualitativeForm(createEmptyQualitativeForm())
    }
  }

  const cancelEdit = () => {
    setEditingChart(null)
    resetForm()
  }

  const createChartFromRecommendation = (recommendation: ChartRecommendation) => {
    if (!recommendationSource) return
    
    setSelectedDataSource(recommendationSource)
    setChartForm({
      chart_name: recommendation.title,
      chart_type: recommendation.type,
      x_axis_column: recommendation.x_axis,
      y_axis_column: recommendation.y_axis || '',
      aggregation_type: recommendation.y_axis ? 'sum' : 'count',
      selected_columns: []
    })
    setQualitativeForm(createEmptyQualitativeForm())
    setShowCreateChart(true)
    setShowRecommendations(false)
  }

  if (loading) {
    return (
      <DashboardLayout isAuthenticated={isAuthenticated} onLogout={logout}>
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading unified dashboard...</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

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
              <h1 className="text-3xl font-bold text-gray-900">Unified Dashboard</h1>
              <p className="text-gray-600 mt-1">Charts from all your data sources</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowRecommendations(!showRecommendations)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                showRecommendations 
                  ? 'bg-yellow-50 border-yellow-300 text-yellow-700' 
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Lightbulb size={18} />
              Recommendations
            </button>
            <button
              onClick={() => setShowCreateChart(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
            >
              <Plus size={20} />
              Create Chart
            </button>
          </div>
        </div>

        <div className="flex gap-6">
          {/* Main Content */}
          <div className={`transition-all duration-300 ${showRecommendations ? 'flex-1' : 'w-full'}`}>
            {charts.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-lg shadow-sm border">
                <BarChart3 className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-xl font-medium text-gray-900 mb-2">No charts created yet</h3>
                <p className="text-gray-600 mb-6">
                  Create your first chart from any data source - sheets, AI transformations, or joins.
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
              <div className="bg-white rounded-lg shadow-sm border p-6">
                <div className="flex items-center gap-2 mb-6">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <h2 className="text-lg font-semibold text-gray-900">All Charts</h2>
                  <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">
                    {charts.length} chart{charts.length !== 1 ? 's' : ''}
                  </span>
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3 gap-8">
                  {charts.map((chart) => {
                    const isQualitativeCards = chart.chart_type === 'qualitative_cards'
                    return (
                      <div 
                        key={chart.id} 
                        className={`border border-gray-200 rounded-xl p-6 hover:border-blue-300 hover:shadow-xl transition-all duration-200 bg-white ${
                          isQualitativeCards ? 'lg:col-span-2 xl:col-span-2 2xl:col-span-2' : ''
                        }`}
                      >
                        <div className="flex justify-between items-start mb-6">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="text-lg font-semibold text-gray-900 truncate">{chart.chart_name}</h4>
                              {isQualitativeCards && (
                                <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-full font-medium">
                                  Interactive
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-600 mb-1 truncate">{chart.source_name}</p>
                            <p className="text-sm text-gray-500 capitalize font-medium">{chart.chart_type.replace('_', ' ')} chart</p>
                          </div>
                          <div className="flex items-center gap-2 ml-4">
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
                        
                        <div className={`bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-xl p-4 relative ${isQualitativeCards ? '' : 'group'} ${
                          isQualitativeCards ? 'h-96' : 'h-64'
                        }`}>
                          <ChartDisplay chartId={chart.id} />
                          {/* Only show overlay for non-qualitative cards */}
                          {!isQualitativeCards && (
                            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-opacity rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100">
                              <button
                                onClick={() => router.push(`/charts/${chart.id}/view?from=charts`)}
                                className="bg-white hover:bg-gray-100 text-gray-900 px-6 py-3 rounded-xl shadow-lg flex items-center gap-3 transition-colors font-semibold"
                              >
                                <Eye size={18} />
                                View Larger
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Recommendations Sidebar */}
          {showRecommendations && (
            <div className="w-80 bg-white rounded-lg shadow-sm border p-6 h-fit">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Lightbulb size={18} className="text-yellow-600" />
                  Chart Recommendations
                </h3>
                <button
                  onClick={() => setShowRecommendations(false)}
                  className="p-1 text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
              
              {/* Data Source Selector */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Data Source
                </label>
                <select
                  value={recommendationSource?.id || ''}
                  onChange={(e) => {
                    const sourceId = e.target.value
                    const source = dataSources.find(ds => ds.id === sourceId)
                    setRecommendationSource(source || null)
                    if (source) fetchRecommendations(source)
                  }}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Choose a data source...</option>
                  {dataSources.map((source) => (
                    <option key={`${source.type}-${source.id}`} value={source.id}>
                      {source.display_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Recommendations */}
              {loadingRecommendations ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                </div>
              ) : recommendations.length > 0 ? (
                <div className="space-y-3">
                  {recommendations.map((rec, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-3 hover:border-blue-300 transition-colors">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="text-sm font-medium text-gray-900">{rec.title}</h4>
                        <button
                          onClick={() => createChartFromRecommendation(rec)}
                          className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="Create chart from recommendation"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                      <p className="text-xs text-gray-600 mb-2">{rec.description}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-gray-100 px-2 py-1 rounded capitalize">{rec.type}</span>
                        <span className="text-xs text-gray-500">X: {rec.x_axis}</span>
                        {rec.y_axis && <span className="text-xs text-gray-500">Y: {rec.y_axis}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : recommendationSource ? (
                <p className="text-sm text-gray-500 text-center py-8">
                  No recommendations available for this data source.
                </p>
              ) : (
                <p className="text-sm text-gray-500 text-center py-8">
                  Select a data source to see chart recommendations.
                </p>
              )}
            </div>
          )}
        </div>

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
                        resetForm()
                      }
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

                  {/* Data Source Selection (only for creation) */}
                  {!editingChart && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Data Source
                      </label>
                      <select
                        value={selectedDataSource?.id || ''}
                        onChange={(e) => {
                          const sourceId = e.target.value
                          const source = dataSources.find(ds => ds.id === sourceId)
                          setSelectedDataSource(source || null)
                          setChartForm(prev => ({
                            ...prev,
                            x_axis_column: '',
                            y_axis_column: '',
                            selected_columns: []
                          }))
                          setQualitativeForm(createEmptyQualitativeForm())
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select a data source</option>
                        {dataSources.map((source) => (
                          <option key={`${source.type}-${source.id}`} value={source.id}>
                            {source.display_name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

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
                          onClick={() => {
                            setChartForm(prev => ({
                              ...prev,
                              chart_type: type.value,
                              x_axis_column: ['table', 'qualitative_cards'].includes(type.value) ? '' : prev.x_axis_column,
                              y_axis_column: ['pie', 'histogram', 'table', 'qualitative_cards'].includes(type.value) ? '' : prev.y_axis_column,
                              selected_columns: type.value === 'table' ? prev.selected_columns : []
                            }))
                            if (type.value === 'qualitative_cards') {
                              setQualitativeForm(createEmptyQualitativeForm())
                            }
                          }}
                        >
                          <p className="font-medium text-gray-900">{type.label}</p>
                          <p className="text-sm text-gray-600">{type.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Configuration for Qualitative Cards */}
                  {selectedDataSource && chartForm.chart_type === 'qualitative_cards' ? (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Unique Identifier Column
                        </label>
                        <select
                          value={qualitativeForm.unique_column}
                          onChange={(e) => setQualitativeForm(prev => ({ ...prev, unique_column: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Select a column</option>
                          {selectedDataSource.columns.map((column, idx) => (
                            <option key={idx} value={column}>{column}</option>
                          ))}
                        </select>
                        <p className="text-xs text-gray-500 mt-1">
                          This column must contain unique values. Duplicate entries will prevent the chart from being created.
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Qualitative Text Column
                        </label>
                        <select
                          value={qualitativeForm.qualitative_column}
                          onChange={(e) => setQualitativeForm(prev => ({ ...prev, qualitative_column: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Select a column</option>
                          {selectedDataSource.columns.map((column, idx) => (
                            <option key={idx} value={column}>{column}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <label className="block text-sm font-medium text-gray-700">
                              Subtitle Metrics <span className="text-gray-500 font-normal">(Optional)</span>
                            </label>
                            <p className="text-xs text-gray-500">Pick one or two numeric columns to show beneath the qualitative text.</p>
                          </div>
                          {qualitativeForm.metrics.length < 2 && (
                            <button
                              type="button"
                              onClick={addMetric}
                              className="text-sm text-blue-600 hover:text-blue-800"
                            >
                              + Add metric
                            </button>
                          )}
                        </div>

                        <div className="space-y-3">
                          {qualitativeForm.metrics.map((metric, idx) => (
                            <div key={idx} className="grid grid-cols-1 md:grid-cols-3 gap-3 border border-gray-200 rounded-lg p-3">
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                  Metric Column {idx + 1}
                                </label>
                                <select
                                  value={metric.column}
                                  onChange={(e) => updateMetric(idx, 'column', e.target.value)}
                                  className="w-full px-2 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                >
                                  <option value="">Select column</option>
                                  {selectedDataSource.columns.map((column, columnIdx) => (
                                    <option key={columnIdx} value={column}>{column}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                  Display Label (optional)
                                </label>
                                <input
                                  type="text"
                                  value={metric.label}
                                  onChange={(e) => updateMetric(idx, 'label', e.target.value)}
                                  placeholder="Shown below the value"
                                  className="w-full px-2 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                />
                              </div>
                              <div className="flex items-end gap-2">
                                <div className="flex-1">
                                  <label className="block text-xs font-medium text-gray-600 mb-1">
                                    Formatting
                                  </label>
                                  <select
                                    value={metric.formatting}
                                    onChange={(e) => updateMetric(idx, 'formatting', e.target.value)}
                                    className="w-full px-2 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                  >
                                    {METRIC_FORMAT_OPTIONS.map(option => (
                                      <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                  </select>
                                </div>
                                {(qualitativeForm.metrics.length > 1 || idx === qualitativeForm.metrics.length - 1) && (
                                  <button
                                    type="button"
                                    onClick={() => removeMetric(idx)}
                                    className="text-xs text-red-600 hover:text-red-800 mt-auto"
                                  >
                                    Remove
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : selectedDataSource && chartForm.chart_type !== 'table' && (
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
                        {selectedDataSource.columns.map((column, idx) => (
                          <option key={idx} value={column}>{column}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Y-Axis Column - Hide for pie, histogram, table, and qualitative cards */}
                  {!['pie', 'histogram', 'table', 'qualitative_cards'].includes(chartForm.chart_type) && selectedDataSource && (
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
                        {selectedDataSource.columns.map((column, idx) => (
                          <option key={idx} value={column}>{column}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Column Selection for Table Charts */}
                  {chartForm.chart_type === 'table' && selectedDataSource && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Select Columns to Display
                      </label>
                      <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-300 rounded-lg p-3">
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            id="select-all-columns"
                            checked={chartForm.selected_columns.length === selectedDataSource.columns.length}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setChartForm(prev => ({ ...prev, selected_columns: [...selectedDataSource.columns] }))
                              } else {
                                setChartForm(prev => ({ ...prev, selected_columns: [] }))
                              }
                            }}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <label htmlFor="select-all-columns" className="ml-2 text-sm font-medium text-gray-900">
                            Select All
                          </label>
                        </div>
                        {selectedDataSource.columns.map((column) => (
                          <div key={column} className="flex items-center">
                            <input
                              type="checkbox"
                              id={`column-${column}`}
                              checked={chartForm.selected_columns.includes(column)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setChartForm(prev => ({ 
                                    ...prev, 
                                    selected_columns: [...prev.selected_columns, column] 
                                  }))
                                } else {
                                  setChartForm(prev => ({ 
                                    ...prev, 
                                    selected_columns: prev.selected_columns.filter(col => col !== column) 
                                  }))
                                }
                              }}
                              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                            />
                            <label htmlFor={`column-${column}`} className="ml-2 text-sm text-gray-700">
                              {column}
                            </label>
                          </div>
                        ))}
                      </div>
                      {chartForm.selected_columns.length === 0 && (
                        <p className="text-sm text-amber-600 mt-1">
                          No columns selected. All columns will be displayed by default.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Aggregation Type - Hide for table and qualitative cards */}
                  {!['table', 'qualitative_cards'].includes(chartForm.chart_type) && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Data Aggregation
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
                  )}
                </div>

                <div className="flex justify-end gap-3 mt-8 pt-6 border-t">
                  <button
                    onClick={() => {
                      if (editingChart) {
                        cancelEdit()
                      } else {
                        setShowCreateChart(false)
                        resetForm()
                      }
                    }}
                    className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={editingChart ? handleUpdateChart : handleCreateChart}
                    disabled={
                      !chartForm.chart_name.trim() || 
                      (!selectedDataSource && !editingChart) || 
                      (chartForm.chart_type === 'qualitative_cards'
                        ? !qualitativeConfigReady
                        : chartForm.chart_type !== 'table' && !chartForm.x_axis_column) ||
                      saving
                    }
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

        {/* AI Chat Assistant */}
        <ChatBot 
          availableChartIds={charts.map(chart => chart.id)}
          currentChartId={charts.length > 0 ? charts[0].id : undefined}
          context={{
            page: 'charts',
            total_charts: charts.length
          }}
        />
      </div>
    </DashboardLayout>
  )
}
