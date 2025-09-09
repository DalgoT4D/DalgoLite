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
}

export interface ChartRendererRef {
  exportToPNG: (filename?: string) => void
}

const ChartRenderer = forwardRef<ChartRendererRef, ChartRendererProps>(({ type, data, options, title }, ref) => {
  const chartRef = useRef<any>(null)

  useImperativeHandle(ref, () => ({
    exportToPNG: (filename = 'chart.png') => {
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

  const renderChart = () => {
    switch (type.toLowerCase()) {
      case 'bar':
      case 'histogram':
        return <Bar ref={chartRef} data={data} options={options} />
      case 'line':
        return <Line ref={chartRef} data={data} options={options} />
      case 'pie':
        return <Pie ref={chartRef} data={data} options={options} />
      case 'scatter':
        return <Scatter ref={chartRef} data={data} options={options} />
      default:
        return <Bar ref={chartRef} data={data} options={options} />
    }
  }

  return <div className="h-full">{renderChart()}</div>
})

ChartRenderer.displayName = 'ChartRenderer'
export default ChartRenderer