'use client'

import React, { useState, useEffect } from 'react'
import { ChevronDown, Database, FileText, Layers, Loader2 } from 'lucide-react'

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

interface DataSourceSelectorProps {
  projectId?: number
  onSourceSelect: (source: DataSource | null) => void
  selectedSource: DataSource | null
}

export default function DataSourceSelector({ 
  projectId, 
  onSourceSelect, 
  selectedSource 
}: DataSourceSelectorProps) {
  const [dataSources, setDataSources] = useState<DataSource[]>([])
  const [loading, setLoading] = useState(true)
  const [showDropdown, setShowDropdown] = useState(false)

  useEffect(() => {
    fetchDataSources()
  }, [projectId])

  const fetchDataSources = async () => {
    try {
      setLoading(true)
      const sources: DataSource[] = []

      if (projectId) {
        // Fetch project-specific data sources
        
        // 1. Get original sheets connected to project
        const projectResponse = await fetch(`http://localhost:8000/projects/${projectId}`)
        if (projectResponse.ok) {
          const project = await projectResponse.json()
          
          const sheetsResponse = await fetch('http://localhost:8000/sheets/connected')
          if (sheetsResponse.ok) {
            const sheetsData = await sheetsResponse.json()
            const projectSheets = sheetsData.sheets.filter((sheet: any) => 
              project.sheet_ids.includes(sheet.id)
            )
            
            projectSheets.forEach((sheet: any) => {
              sources.push({
                id: `sheet-${sheet.id}`,
                type: 'sheet',
                name: sheet.title,
                columns: sheet.columns || [],
                metadata: {
                  total_rows: sheet.total_rows,
                  sheet_name: sheet.sheet_name
                }
              })
            })
          }

          // 2. Get transformation tables
          const transformsResponse = await fetch(`http://localhost:8000/projects/${projectId}/ai-transformations`)
          if (transformsResponse.ok) {
            const transformsData = await transformsResponse.json()
            const completedSteps = transformsData.steps.filter((step: any) => 
              step.status === 'completed' && step.output_columns
            )

            completedSteps.forEach((step: any) => {
              // Extract table name from code_explanation
              let tableName = `transform_${step.id}`
              if (step.code_explanation) {
                const lines = step.code_explanation.split('\n')
                for (const line of lines) {
                  if (line.startsWith('Output table:')) {
                    tableName = line.split(':', 2)[1]?.trim() || tableName
                    break
                  }
                }
              }

              sources.push({
                id: `transform-${step.id}`,
                type: 'transformation',
                name: tableName,
                columns: step.output_columns || [],
                metadata: {
                  transformation_step: step.step_name,
                  project_name: project.name
                }
              })
            })
          }

          // 3. Add project combined data option if there are transformations
          if (sources.some(s => s.type === 'transformation')) {
            try {
              const projectDataResponse = await fetch(`http://localhost:8000/projects/${projectId}/data-sources`)
              if (projectDataResponse.ok) {
                const projectDataSources = await projectDataResponse.json()
                
                // Get unique columns from all project data
                const allColumns = new Set<string>()
                projectDataSources.forEach((source: any) => {
                  if (source.columns) {
                    source.columns.forEach((col: string) => allColumns.add(col))
                  }
                })

                sources.push({
                  id: `project-${projectId}`,
                  type: 'project',
                  name: `${project.name} (Combined Data)`,
                  columns: Array.from(allColumns),
                  metadata: {
                    project_name: project.name,
                    total_rows: projectDataSources.reduce((total: number, source: any) => 
                      total + (source.total_rows || 0), 0
                    )
                  }
                })
              }
            } catch (error) {
              console.log('Project combined data not available:', error)
            }
          }
        }
      } else {
        // Fetch all available sheets for global chart creation
        const sheetsResponse = await fetch('http://localhost:8000/sheets/connected')
        if (sheetsResponse.ok) {
          const sheetsData = await sheetsResponse.json()
          
          sheetsData.sheets.forEach((sheet: any) => {
            sources.push({
              id: `sheet-${sheet.id}`,
              type: 'sheet',
              name: sheet.title,
              columns: sheet.columns || [],
              metadata: {
                total_rows: sheet.total_rows,
                sheet_name: sheet.sheet_name
              }
            })
          })
        }
      }

      setDataSources(sources)
    } catch (error) {
      console.error('Error fetching data sources:', error)
    } finally {
      setLoading(false)
    }
  }

  const getSourceIcon = (type: DataSource['type']) => {
    switch (type) {
      case 'sheet':
        return <FileText size={16} className="text-blue-600" />
      case 'transformation':
        return <Layers size={16} className="text-green-600" />
      case 'project':
        return <Database size={16} className="text-purple-600" />
      default:
        return <Database size={16} className="text-gray-600" />
    }
  }

  const getSourceTypeLabel = (type: DataSource['type']) => {
    switch (type) {
      case 'sheet':
        return 'Original Sheet'
      case 'transformation':
        return 'AI Transform'
      case 'project':
        return 'Combined Data'
      default:
        return 'Data Source'
    }
  }

  const getSourceDescription = (source: DataSource) => {
    switch (source.type) {
      case 'sheet':
        return `${source.columns.length} columns • ${source.metadata.total_rows?.toLocaleString() || 0} rows`
      case 'transformation':
        return `From: ${source.metadata.transformation_step} • ${source.columns.length} columns`
      case 'project':
        return `${source.columns.length} total columns • Combined dataset`
      default:
        return `${source.columns.length} columns`
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4 border border-gray-300 rounded-lg bg-gray-50">
        <Loader2 size={16} className="animate-spin text-gray-600 mr-2" />
        <span className="text-sm text-gray-600">Loading data sources...</span>
      </div>
    )
  }

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Data Source
        <span className="text-red-500 ml-1">*</span>
      </label>
      
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowDropdown(!showDropdown)}
          className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 rounded-lg bg-white hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          {selectedSource ? (
            <div className="flex items-center gap-3">
              {getSourceIcon(selectedSource.type)}
              <div className="text-left">
                <div className="font-medium text-gray-900">{selectedSource.name}</div>
                <div className="text-xs text-gray-500">{getSourceDescription(selectedSource)}</div>
              </div>
            </div>
          ) : (
            <span className="text-gray-500">Select a data source</span>
          )}
          <ChevronDown size={16} className={`text-gray-400 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
        </button>

        {showDropdown && (
          <>
            <div 
              className="fixed inset-0 z-10" 
              onClick={() => setShowDropdown(false)}
            />
            <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {dataSources.length === 0 ? (
                <div className="p-4 text-center text-gray-500">
                  No data sources available
                </div>
              ) : (
                <div className="p-1">
                  {dataSources.map((source) => (
                    <button
                      key={source.id}
                      type="button"
                      onClick={() => {
                        onSourceSelect(source)
                        setShowDropdown(false)
                      }}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors ${
                        selectedSource?.id === source.id ? 'bg-blue-50 border border-blue-200' : ''
                      }`}
                    >
                      {getSourceIcon(source.type)}
                      <div className="flex-1 text-left">
                        <div className="font-medium text-gray-900">{source.name}</div>
                        <div className="text-xs text-gray-600 mb-1">
                          {getSourceTypeLabel(source.type)}
                        </div>
                        <div className="text-xs text-gray-500">
                          {getSourceDescription(source)}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {selectedSource && (
        <div className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex items-center gap-2 mb-2">
            {getSourceIcon(selectedSource.type)}
            <span className="font-medium text-sm">{getSourceTypeLabel(selectedSource.type)}</span>
          </div>
          <div className="text-xs text-gray-600">
            <strong>Columns:</strong> {selectedSource.columns.slice(0, 3).join(', ')}
            {selectedSource.columns.length > 3 && ` +${selectedSource.columns.length - 3} more`}
          </div>
          {selectedSource.metadata.transformation_step && (
            <div className="text-xs text-gray-600 mt-1">
              <strong>From transformation:</strong> {selectedSource.metadata.transformation_step}
            </div>
          )}
        </div>
      )}
    </div>
  )
}