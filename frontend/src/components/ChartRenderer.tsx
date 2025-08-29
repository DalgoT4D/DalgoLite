'use client'

import { useEffect, useRef } from 'react'
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

export default function ChartRenderer({ type, data, options, title }: ChartRendererProps) {
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
        return <Bar data={data} options={options} />
      case 'line':
        return <Line data={data} options={options} />
      case 'pie':
        return <Pie data={data} options={options} />
      case 'scatter':
        return <Scatter data={data} options={options} />
      default:
        return <Bar data={data} options={options} />
    }
  }

  return <div className="h-full">{renderChart()}</div>
}