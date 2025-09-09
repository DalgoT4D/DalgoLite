'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Download, Edit2, Settings, BarChart3 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import Navigation from '@/components/Navigation'
import ChartRenderer, { ChartRendererRef } from '@/components/ChartRenderer'

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

interface ChartData {
  chart_type: string
  data: any
  options: any
  chart_name: string
}

export default function ChartViewPage({ params }: { params: { id: string } }) {
  const { isAuthenticated, logout } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [chart, setChart] = useState<Chart | null>(null)
  const [chartData, setChartData] = useState<ChartData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  
  // Reference to the chart component for export functionality
  const chartRef = useRef<ChartRendererRef>(null)
  
  // Get the 'from' parameter to determine where to navigate back to
  const fromParam = searchParams.get('from')
  const sourceId = searchParams.get('sourceId')

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/')
      return
    }
    fetchChartData()
  }, [isAuthenticated, router, params.id])

  const fetchChartData = async () => {
    try {
      setLoading(true)
      
      // Fetch chart metadata
      const chartResponse = await fetch(`http://localhost:8005/charts/${params.id}`)
      if (!chartResponse.ok) {
        setError('Chart not found')
        return
      }
      const chartInfo = await chartResponse.json()
      setChart(chartInfo)

      // Fetch chart data for rendering
      const dataResponse = await fetch(`http://localhost:8005/charts/${params.id}/data`)
      if (!dataResponse.ok) {
        setError('Failed to load chart data')
        return
      }
      const data = await dataResponse.json()
      setChartData(data)
      
    } catch (error) {
      console.error('Error fetching chart:', error)
      setError('Error loading chart')
    } finally {
      setLoading(false)
    }
  }

  const handleBackNavigation = () => {
    if (fromParam && sourceId) {
      switch (fromParam) {
        case 'dashboard':
          router.push('/dashboard')
          break
        case 'sheets':
          router.push(`/sheets/${sourceId}`)
          break
        case 'transform':
          router.push(`/transform/${sourceId}`)
          break
        case 'charts':
          router.push('/charts')
          break
        default:
          router.push('/charts')
      }
    } else {
      // Fallback navigation
      router.back()
    }
  }

  const handleEdit = () => {
    if (chart) {
      const editUrl = chart.source_type === 'sheet' 
        ? `/charts?sheet=${chart.source_id}&edit=${chart.id}`
        : `/charts?edit=${chart.id}`
      router.push(editUrl)
    }
  }

  const handleExportPNG = () => {
    if (!chart || !chartRef.current) return
    
    setIsExporting(true)
    try {
      // Create a clean filename from chart name
      const cleanName = chart.chart_name
        .replace(/[^a-z0-9]/gi, '_')
        .toLowerCase()
      const filename = `${cleanName}_${new Date().toISOString().split('T')[0]}.png`
      
      // Export the chart
      chartRef.current.exportToPNG(filename)
    } catch (error) {
      console.error('Export failed:', error)
      alert('Failed to export chart. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  const getBackButtonText = () => {
    switch (fromParam) {
      case 'dashboard': return 'Back to Dashboard'
      case 'sheets': return 'Back to Sheet'
      case 'transform': return 'Back to Transform'
      case 'charts': return 'Back to Charts'
      default: return 'Back'
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation isAuthenticated={isAuthenticated} onLogout={logout} />
        <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading chart...</p>
            </div>
          </div>
        </main>
      </div>
    )
  }

  if (error || !chart || !chartData) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation isAuthenticated={isAuthenticated} onLogout={logout} />
        <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <div className="text-center py-20">
            <BarChart3 className="mx-auto h-16 w-16 text-gray-400 mb-4" />
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">Chart not found</h2>
            <p className="text-gray-600 mb-6">{error || 'The chart you are looking for does not exist.'}</p>
            <button
              onClick={handleBackNavigation}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg inline-flex items-center gap-2"
            >
              <ArrowLeft size={20} />
              {getBackButtonText()}
            </button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation isAuthenticated={isAuthenticated} onLogout={logout} />
      
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border mb-6">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={handleBackNavigation}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  title={getBackButtonText()}
                >
                  <ArrowLeft size={20} />
                </button>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">{chart.chart_name}</h1>
                  <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                    <span className="capitalize bg-gray-100 px-2 py-1 rounded">
                      {chart.chart_type} chart
                    </span>
                    <span>From: {chart.source_name}</span>
                    <span>Created: {new Date(chart.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <button
                  onClick={handleEdit}
                  className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <Edit2 size={16} />
                  Edit Chart
                </button>
                <button
                  onClick={handleExportPNG}
                  disabled={isExporting || !chartData}
                  className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  <Download size={16} />
                  {isExporting ? 'Exporting...' : 'Export PNG'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Chart Display */}
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-6">
            {/* Chart Details */}
            <div className="mb-6 pb-4 border-b border-gray-100">
              <div className="flex items-center gap-6 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <span className="font-medium">X-Axis:</span>
                  <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                    {chart.x_axis_column}
                  </span>
                </div>
                {chart.y_axis_column && (
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Y-Axis:</span>
                    <span className="bg-green-100 text-green-800 px-2 py-1 rounded">
                      {chart.y_axis_column}
                    </span>
                  </div>
                )}
                {chart.chart_config?.aggregation_type && (
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Aggregation:</span>
                    <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded capitalize">
                      {chart.chart_config.aggregation_type}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Chart Container - Large Format */}
            <div className="w-full" style={{ height: '600px' }}>
              <ChartRenderer
                ref={chartRef}
                type={chartData.chart_type}
                data={chartData.data}
                options={{
                  ...chartData.options,
                  responsive: true,
                  maintainAspectRatio: false,
                  backgroundColor: '#ffffff',
                  plugins: {
                    ...chartData.options?.plugins,
                    legend: {
                      ...chartData.options?.plugins?.legend,
                      display: true,
                      position: 'top' as const,
                      labels: {
                        ...chartData.options?.plugins?.legend?.labels,
                        color: '#374151', // Gray-700 for text
                        usePointStyle: true,
                      },
                    },
                    title: {
                      ...chartData.options?.plugins?.title,
                      display: false, // We show title in header instead
                    },
                  },
                  scales: {
                    ...chartData.options?.scales,
                    x: {
                      ...chartData.options?.scales?.x,
                      title: {
                        display: true,
                        text: chart.x_axis_column,
                        font: {
                          size: 14,
                          weight: 'bold' as const,
                        },
                        color: '#374151', // Gray-700
                      },
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
                      title: {
                        display: true,
                        text: chart.y_axis_column || 'Count',
                        font: {
                          size: 14,
                          weight: 'bold' as const,
                        },
                        color: '#374151', // Gray-700
                      },
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
                title={chart.chart_name}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}