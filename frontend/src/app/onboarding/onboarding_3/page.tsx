'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { BarChart3, ArrowRight, Sparkles, TrendingUp, PieChart, Plus, Trash2, Edit2, Save, X, Eye } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import ChartRenderer from '@/components/ChartRenderer'
import { getApiUrl } from '@/lib/config'

interface ProgressRibbonProps {
  currentStep: number
  totalSteps: number
}

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
              color: '#374151',
            },
          },
        },
        scales: {
          ...chartData.options?.scales,
          x: {
            ...chartData.options?.scales?.x,
            ticks: {
              ...chartData.options?.scales?.x?.ticks,
              color: '#6B7280',
            },
            grid: {
              ...chartData.options?.scales?.x?.grid,
              color: '#E5E7EB',
            },
          },
          y: {
            ...chartData.options?.scales?.y,
            ticks: {
              ...chartData.options?.scales?.y?.ticks,
              color: '#6B7280',
            },
            grid: {
              ...chartData.options?.scales?.y?.grid,
              color: '#E5E7EB',
            },
          },
        },
      }}
      title={chartData.chart_name}
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
  type: 'sheet' | 'transformation' | 'join'
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

export default function Onboarding3Page() {
  const { isAuthenticated, completeOnboarding } = useAuth()
  const router = useRouter()

  const [charts, setCharts] = useState<Chart[]>([])
  const [dataSources, setDataSources] = useState<DataSource[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateChart, setShowCreateChart] = useState(false)
  const [editingChart, setEditingChart] = useState<Chart | null>(null)
  const [selectedDataSource, setSelectedDataSource] = useState<DataSource | null>(null)

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
    if (isAuthenticated) {
      fetchCharts()
      fetchDataSources()
    }
  }, [isAuthenticated])

  useEffect(() => {
    // Check if we should scroll to charts (after creating a new chart)
    const urlParams = new URLSearchParams(window.location.search)
    if (urlParams.get('scrollToCharts') === 'true' && charts.length > 0) {
      // Remove the query parameter
      window.history.replaceState({}, '', window.location.pathname)
      // Scroll to the charts section
      setTimeout(() => {
        const chartsSection = document.getElementById('charts-section')
        if (chartsSection) {
          chartsSection.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, 100)
    }
  }, [charts])

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

  const handleCreateChart = async () => {
    if (!chartForm.chart_name.trim() || !chartForm.x_axis_column || !selectedDataSource) return

    setSaving(true)
    try {
      let extractedSourceId: string
      if (selectedDataSource.id.startsWith('sheet-')) {
        extractedSourceId = selectedDataSource.id.replace('sheet-', '')
      } else if (selectedDataSource.id.startsWith('join-')) {
        extractedSourceId = selectedDataSource.id.replace('join-', '')
      } else if (selectedDataSource.id.startsWith('transform-')) {
        extractedSourceId = selectedDataSource.id.replace('transform-', '')
      } else if (selectedDataSource.id.startsWith('project-')) {
        extractedSourceId = selectedDataSource.id.replace('project-', '')
      } else {
        extractedSourceId = selectedDataSource.id
      }

      const requestData = {
        chart_name: chartForm.chart_name,
        chart_type: chartForm.chart_type,
        x_axis_column: chartForm.x_axis_column,
        y_axis_column: chartForm.y_axis_column || undefined,
        chart_config: {
          aggregation_type: chartForm.aggregation_type
        },
        source_type: selectedDataSource.type,
        source_id: extractedSourceId
      }

      const response = await fetch(getApiUrl('/charts/unified'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      })

      if (response.ok) {
        setShowCreateChart(false)
        resetForm()
        // Refresh the page with scroll parameter to show the created chart
        window.location.href = `${window.location.pathname}?scrollToCharts=true`
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
      aggregation_type: 'count'
    })
    setSelectedDataSource(null)
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

  const handleCompleteOnboarding = async () => {
    try {
      await completeOnboarding()
      router.push('/home')
    } catch (error) {
      console.error('Error completing onboarding:', error)
      // Still navigate to home even if the API call fails
      router.push('/home')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <ProgressRibbon currentStep={3} totalSteps={3} />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <div className="flex justify-center mb-6">
            <div className="bg-purple-100 rounded-full p-6">
              <BarChart3 className="text-purple-600" size={48} />
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Step 3: Create Visualizations
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Transform your data into beautiful, interactive charts and dashboards that tell compelling stories.
          </p>
        </div>

        {/* Existing Charts */}
        {!loading && charts.length > 0 && (
          <div id="charts-section" className="bg-white rounded-xl shadow-sm border p-8 mb-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Your Charts</h2>
              <button
                onClick={handleCompleteOnboarding}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg inline-flex items-center gap-2 transition-colors"
              >
                Complete Onboarding
                <ArrowRight size={20} />
              </button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {charts.map((chart) => (
                <div key={chart.id} className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-lg transition-all duration-200">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold text-gray-900 mb-1 truncate">{chart.chart_name}</h4>
                      <p className="text-xs text-gray-600 mb-1 truncate">{chart.source_name}</p>
                      <p className="text-xs text-gray-500 capitalize">{chart.chart_type} chart</p>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      <button
                        onClick={() => startEditChart(chart)}
                        className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteChart(chart.id)}
                        className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="h-40 bg-gray-50 rounded-lg p-2 relative group">
                    <ChartDisplay chartId={chart.id} />
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-opacity rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <button
                        onClick={() => router.push(`/charts/${chart.id}/view?from=charts`)}
                        className="bg-white hover:bg-gray-100 text-gray-900 px-4 py-2 rounded-lg shadow-md flex items-center gap-2 transition-colors"
                      >
                        <Eye size={16} />
                        View Larger
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">Build Stunning Charts</h2>
              <p className="text-gray-600 mb-8">
                Let AI recommend the best visualizations for your data, or choose from our extensive library.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              <div className="bg-orange-50 rounded-lg p-6 text-center">
                <div className="bg-orange-100 rounded-full p-3 w-12 h-12 mx-auto mb-4 flex items-center justify-center">
                  <TrendingUp className="text-orange-600" size={24} />
                </div>
                <h3 className="text-lg font-medium text-orange-900 mb-2">Line Charts</h3>
                <p className="text-sm text-orange-800">Perfect for showing trends and changes over time</p>
              </div>

              <div className="bg-blue-50 rounded-lg p-6 text-center">
                <div className="bg-blue-100 rounded-full p-3 w-12 h-12 mx-auto mb-4 flex items-center justify-center">
                  <BarChart3 className="text-blue-600" size={24} />
                </div>
                <h3 className="text-lg font-medium text-blue-900 mb-2">Bar Charts</h3>
                <p className="text-sm text-blue-800">Great for comparing categories and values</p>
              </div>

              <div className="bg-pink-50 rounded-lg p-6 text-center">
                <div className="bg-pink-100 rounded-full p-3 w-12 h-12 mx-auto mb-4 flex items-center justify-center">
                  <PieChart className="text-pink-600" size={24} />
                </div>
                <h3 className="text-lg font-medium text-pink-900 mb-2">Pie Charts</h3>
                <p className="text-sm text-pink-800">Ideal for showing proportions and percentages</p>
              </div>
            </div>

            <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-6">
              <div className="flex items-center gap-3 mb-3">
                <Sparkles className="text-purple-600" size={24} />
                <h3 className="text-lg font-medium text-purple-900">AI-Powered Chart Recommendations</h3>
              </div>
              <ul className="space-y-2 text-purple-800 text-sm">
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-purple-600 rounded-full mt-2"></div>
                  <span>Get smart suggestions based on your data type and structure</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-purple-600 rounded-full mt-2"></div>
                  <span>Automatically optimize chart settings for maximum clarity</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-purple-600 rounded-full mt-2"></div>
                  <span>Generate insights and annotations for your visualizations</span>
                </li>
              </ul>
            </div>

            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-3">What you'll accomplish:</h3>
              <ul className="space-y-2 text-gray-700">
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-gray-600 rounded-full mt-2"></div>
                  <span>Create your first interactive chart</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-gray-600 rounded-full mt-2"></div>
                  <span>Learn to customize colors, labels, and styling</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-gray-600 rounded-full mt-2"></div>
                  <span>Discover AI-powered visualization insights</span>
                </li>
              </ul>
            </div>

            <div className="flex justify-center pt-6">
              {loading ? (
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-2"></div>
                  <p className="text-gray-600">Loading...</p>
                </div>
              ) : dataSources.length === 0 ? (
                <div className="text-center">
                  <p className="text-amber-600 mb-4">You need to connect data sources first.</p>
                  <button
                    onClick={() => router.push('/onboarding/onboarding_1')}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg inline-flex items-center gap-2 transition-colors"
                  >
                    Go Back to Connect Data
                  </button>
                </div>
              ) : (
                <div className="flex gap-4">
                  <button
                    onClick={() => setShowCreateChart(true)}
                    className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-8 rounded-lg inline-flex items-center gap-2 transition-colors"
                  >
                    <BarChart3 size={20} />
                    Create Your First Chart
                  </button>
                  <button
                    onClick={handleCompleteOnboarding}
                    className="bg-gray-600 hover:bg-gray-700 text-white font-semibold py-3 px-8 rounded-lg inline-flex items-center gap-2 transition-colors"
                  >
                    <ArrowRight size={20} />
                    Skip to Dashboard
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {charts.length === 0 && !loading && (
          <div className="mt-8 text-center">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 inline-block">
              <p className="text-green-800 font-medium">
                🎉 You're almost done! This is the final step of your onboarding journey.
              </p>
            </div>
          </div>
        )}
      </main>

      {/* Create Chart Modal */}
      {showCreateChart && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-semibold text-gray-900">Create New Chart</h3>
                <button
                  onClick={() => {
                    setShowCreateChart(false)
                    resetForm()
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                {/* Data Source Selection */}
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
                        y_axis_column: ''
                      }))
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">Select a data source</option>
                    {dataSources.map((source) => (
                      <option key={`${source.type}-${source.id}`} value={source.id}>
                        {source.display_name}
                      </option>
                    ))}
                  </select>
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
                            ? 'border-purple-500 bg-purple-50'
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

                {/* X-Axis Column */}
                {selectedDataSource && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      X-Axis Column
                    </label>
                    <select
                      value={chartForm.x_axis_column}
                      onChange={(e) => setChartForm(prev => ({ ...prev, x_axis_column: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">Select a column</option>
                      {selectedDataSource.columns.map((column, idx) => (
                        <option key={idx} value={column}>{column}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Y-Axis Column */}
                {!['pie', 'histogram'].includes(chartForm.chart_type) && selectedDataSource && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Y-Axis Column (optional)
                    </label>
                    <select
                      value={chartForm.y_axis_column}
                      onChange={(e) => setChartForm(prev => ({ ...prev, y_axis_column: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">Use X-axis column for aggregation</option>
                      {selectedDataSource.columns.map((column, idx) => (
                        <option key={idx} value={column}>{column}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Aggregation Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Data Aggregation
                  </label>
                  <select
                    value={chartForm.aggregation_type}
                    onChange={(e) => setChartForm(prev => ({ ...prev, aggregation_type: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
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
                    setShowCreateChart(false)
                    resetForm()
                  }}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateChart}
                  disabled={!chartForm.chart_name.trim() || !chartForm.x_axis_column || !selectedDataSource || saving}
                  className="bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white px-6 py-2 rounded-lg flex items-center gap-2 transition-colors"
                >
                  <Save size={18} />
                  {saving ? 'Creating...' : 'Create Chart'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}