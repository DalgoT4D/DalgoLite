'use client'

import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  ScatterController,
  LineController,
  BarController,
  PieController
} from 'chart.js'
import { Bar, Line, Pie, Scatter } from 'react-chartjs-2'
import QualitativeCardsChart from './QualitativeCardsChart'

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  ScatterController,
  LineController,
  BarController,
  PieController
)

interface ChartRendererProps {
  type: string
  data: any
  options?: any
  title?: string
  selectedColumns?: string[]
  chartConfig?: any
}

export interface ChartRendererRef {
  exportToPNG: (filename?: string) => void
}

const ChartRenderer = forwardRef<ChartRendererRef, ChartRendererProps>(({ type, data, options, title, selectedColumns, chartConfig }, ref) => {
  const chartRef = useRef<any>(null)
  const chartType = type.toLowerCase()

  useImperativeHandle(ref, () => ({
    exportToPNG: (filename = 'chart.png') => {
      if (chartType === 'qualitative_cards') {
        console.warn('Export to PNG is not supported for Qualitative Cards charts yet.')
        return
      }

      if (chartRef.current) {
        const chartInstance = chartRef.current

        // Store original background color
        const originalBackgroundColor = chartInstance.options.plugins?.legend?.backgroundColor
        
        // Temporarily set white background for export
        if (chartInstance.options.plugins) {
          chartInstance.options.plugins.backgroundColor = '#ffffff'
        }
        
        // Get the canvas and create a new canvas with white background
        const canvas = chartInstance.canvas
        const ctx = canvas.getContext('2d')
        
        // Create a new canvas for export with white background
        const exportCanvas = document.createElement('canvas')
        exportCanvas.width = canvas.width
        exportCanvas.height = canvas.height
        const exportCtx = exportCanvas.getContext('2d')
        
        // Fill with white background
        if (exportCtx) {
          exportCtx.fillStyle = '#ffffff'
          exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height)
          
          // Draw the original chart on top
          exportCtx.drawImage(canvas, 0, 0)
          
          // Get the data URL from the export canvas
          const url = exportCanvas.toDataURL('image/png', 1.0)
          
          // Create download link
          const link = document.createElement('a')
          link.download = filename
          link.href = url
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
        }
        
        // Restore original background color if it was set
        if (chartInstance.options.plugins && originalBackgroundColor) {
          chartInstance.options.plugins.backgroundColor = originalBackgroundColor
        }
      }
    }
  }), [])
  if (!data) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-100 rounded-lg">
        <p className="text-gray-500">Unable to render chart with provided data</p>
      </div>
    )
  }

  const renderTable = () => {
    if (!data?.datasets?.[0]?.data && !data?.raw_data && !Array.isArray(data)) {
      return (
        <div className="flex items-center justify-center h-64 text-gray-500">
          No data available for table
        </div>
      )
    }

    // Extract table data from chart data structure
    let tableData: any[] = []
    let columns: string[] = []

    if (data.labels && data.datasets?.[0]?.data) {
      // For aggregated data (labels + data)
      columns = ['Category', 'Value']
      tableData = data.labels.map((label: string, index: number) => ({
        Category: label,
        Value: data.datasets[0].data[index]
      }))
    } else if (Array.isArray(data)) {
      // For raw data arrays
      tableData = data
      columns = tableData.length > 0 ? Object.keys(tableData[0]) : []
    } else if (data.raw_data && Array.isArray(data.raw_data)) {
      // For raw data in raw_data property
      tableData = data.raw_data
      columns = tableData.length > 0 ? Object.keys(tableData[0]) : []
    }

    // Filter columns if selectedColumns is provided
    const displayColumns = selectedColumns && selectedColumns.length > 0 
      ? columns.filter(col => selectedColumns.includes(col))
      : columns

    return (
      <div className="w-full h-full overflow-auto">
        <div className="min-w-full">
          <table className="w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                {displayColumns.map((column) => (
                  <th
                    key={column}
                    className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 last:border-r-0"
                  >
                    <div className="truncate" title={column}>
                      {column}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {tableData.map((row, index) => (
                <tr key={index} className={index % 2 === 0 ? 'bg-white hover:bg-gray-50' : 'bg-gray-50 hover:bg-gray-100'}>
                  {displayColumns.map((column) => (
                    <td key={column} className="px-3 py-2 text-sm text-gray-900 border-r border-gray-100 last:border-r-0">
                      <div className="max-w-xs truncate" title={row[column] ?? '-'}>
                        {row[column] ?? '-'}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  const renderChart = () => {
    switch (chartType) {
      case 'bar':
      case 'histogram':
        return <Bar ref={chartRef} data={data} options={options} />
      case 'line':
        return <Line ref={chartRef} data={data} options={options} />
      case 'pie':
        return <Pie ref={chartRef} data={data} options={options} />
      case 'scatter':
        return <Scatter ref={chartRef} data={data} options={options} />
      case 'table':
        return renderTable()
      case 'qualitative_cards':
        return (
          <QualitativeCardsChart
            data={data}
            title={title}
            config={chartConfig}
            metadata={data?.metadata}
          />
        )
      default:
        return <Bar ref={chartRef} data={data} options={options} />
    }
  }

  return <div className="h-full">{renderChart()}</div>
})

ChartRenderer.displayName = 'ChartRenderer'
export default ChartRenderer
