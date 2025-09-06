'use client'

import React, { useState, useEffect } from 'react'
import { X, Download, Search, ChevronLeft, ChevronRight, Eye, FileText, Layers, Database } from 'lucide-react'

interface DataViewerProps {
  isOpen: boolean
  onClose: () => void
  sourceId: string
  sourceType: 'sheet' | 'transformation' | 'project'
  sourceName: string
  transformationStep?: string
}

interface DataResponse {
  columns: string[]
  data: (string | number | null)[][]
  total_rows: number
  table_name?: string
}

export default function DataViewer({ 
  isOpen, 
  onClose, 
  sourceId, 
  sourceType, 
  sourceName, 
  transformationStep 
}: DataViewerProps) {
  const [data, setData] = useState<DataResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState('')
  const [filteredData, setFilteredData] = useState<(string | number | null)[][]>([])
  
  const ROWS_PER_PAGE = 50

  useEffect(() => {
    if (isOpen && sourceId) {
      fetchData()
    }
  }, [isOpen, sourceId, sourceType])

  useEffect(() => {
    if (data?.data) {
      if (searchTerm.trim()) {
        const filtered = data.data.filter(row => 
          row.some(cell => 
            cell?.toString().toLowerCase().includes(searchTerm.toLowerCase())
          )
        )
        setFilteredData(filtered)
      } else {
        setFilteredData(data.data)
      }
      setCurrentPage(1)
    }
  }, [data, searchTerm])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    
    try {
      let url = ''
      
      switch (sourceType) {
        case 'sheet':
          const sheetId = sourceId.replace('sheet-', '')
          url = `http://localhost:8000/sheets/${sheetId}/data`
          break
        case 'transformation':
          const stepId = sourceId.replace('transform-', '')
          url = `http://localhost:8000/ai-transformations/${stepId}/data`
          break
        case 'project':
          const projectId = sourceId.replace('project-', '')
          url = `http://localhost:8000/projects/${projectId}/data`
          break
        default:
          throw new Error('Unknown source type')
      }

      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Failed to fetch data: ${response.statusText}`)
      }

      const result = await response.json()
      setData(result)
    } catch (err) {
      console.error('Error fetching data:', err)
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const getSourceIcon = () => {
    switch (sourceType) {
      case 'sheet':
        return <FileText size={16} className="text-blue-600" />
      case 'transformation':
        return <Layers size={16} className="text-green-600" />
      case 'project':
        return <Database size={16} className="text-purple-600" />
      default:
        return <Eye size={16} className="text-gray-600" />
    }
  }

  const getSourceTypeLabel = () => {
    switch (sourceType) {
      case 'sheet':
        return 'Original Sheet'
      case 'transformation':
        return 'AI Transformation'
      case 'project':
        return 'Project Data'
      default:
        return 'Data Source'
    }
  }

  const totalPages = Math.ceil(filteredData.length / ROWS_PER_PAGE)
  const startIndex = (currentPage - 1) * ROWS_PER_PAGE
  const endIndex = startIndex + ROWS_PER_PAGE
  const currentData = filteredData.slice(startIndex, endIndex)

  const downloadCSV = () => {
    if (!data) return

    const csvContent = [
      data.columns.join(','),
      ...filteredData.map(row => 
        row.map(cell => {
          // Escape cells that contain commas or quotes
          const str = cell?.toString() || ''
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`
          }
          return str
        }).join(',')
      )
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob)
      link.setAttribute('href', url)
      link.setAttribute('download', `${sourceName.replace(/[^a-zA-Z0-9]/g, '_')}_data.csv`)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            {getSourceIcon()}
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{sourceName}</h2>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <span className="px-2 py-1 bg-gray-100 rounded text-xs font-medium">
                  {getSourceTypeLabel()}
                </span>
                {transformationStep && (
                  <span className="text-gray-500">from: {transformationStep}</span>
                )}
                {data?.table_name && (
                  <span className="text-gray-500">• Table: {data.table_name}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {data && (
              <button
                onClick={downloadCSV}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                title="Download as CSV"
              >
                <Download size={16} />
                Export CSV
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Close"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Search and Stats */}
        {data && (
          <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50">
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search data..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Clear search
                </button>
              )}
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <span>
                {filteredData.length.toLocaleString()} of {data.total_rows.toLocaleString()} rows
              </span>
              <span>
                {data.columns.length} columns
              </span>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading data...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-red-600">
                <p className="text-lg font-medium mb-2">Error loading data</p>
                <p className="text-sm">{error}</p>
                <button
                  onClick={fetchData}
                  className="mt-4 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
                >
                  Try again
                </button>
              </div>
            </div>
          ) : data ? (
            <>
              {/* Data Table */}
              <div className="flex-1 overflow-auto" style={{ maxHeight: 'calc(100vh - 300px)' }}>
                <table className="w-full border-collapse">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="w-12 px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase border-b border-gray-200">
                        #
                      </th>
                      {data.columns.map((column, index) => (
                        <th
                          key={index}
                          className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase border-b border-gray-200 min-w-32"
                          title={column}
                        >
                          <div className="truncate max-w-32">{column}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {currentData.map((row, rowIndex) => (
                      <tr key={rowIndex} className="hover:bg-gray-50 border-b border-gray-100">
                        <td className="px-3 py-2 text-xs text-gray-500 border-r border-gray-200">
                          {startIndex + rowIndex + 1}
                        </td>
                        {row.map((cell, cellIndex) => (
                          <td
                            key={cellIndex}
                            className="px-4 py-2 text-sm text-gray-900 border-r border-gray-100 max-w-64"
                            title={cell?.toString() || ''}
                          >
                            <div className="truncate">
                              {cell !== null && cell !== undefined ? cell.toString() : (
                                <span className="text-gray-400 italic">null</span>
                              )}
                            </div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t border-gray-200 bg-gray-50">
                  <div className="text-sm text-gray-600">
                    Showing {startIndex + 1} to {Math.min(endIndex, filteredData.length)} of {filteredData.length} rows
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="flex items-center gap-1 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft size={16} />
                      Previous
                    </button>
                    <span className="px-4 py-2 text-sm text-gray-600">
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      className="flex items-center gap-1 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}