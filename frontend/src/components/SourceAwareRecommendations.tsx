'use client'

import React, { useState, useEffect } from 'react'
import { Plus, RefreshCw, Filter, FileText, Layers, Database } from 'lucide-react'
import { getApiUrl, API_ENDPOINTS } from '@/lib/config'

interface DataSource {
  id: string
  type: 'sheet' | 'transformation' | 'project'
  name: string
  columns: string[]
}

interface SourcedRecommendation {
  type: string
  title: string
  description: string
  x_axis: string
  y_axis?: string
  reason: string
  source: DataSource
}

interface SourceAwareRecommendationsProps {
  projectId?: number
  sheetId?: number
  dataSources: DataSource[]
  onCreateChart: (recommendation: SourcedRecommendation) => void
}

export default function SourceAwareRecommendations({
  projectId,
  sheetId,
  dataSources,
  onCreateChart
}: SourceAwareRecommendationsProps) {
  const [recommendations, setRecommendations] = useState<SourcedRecommendation[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedSourceFilter, setSelectedSourceFilter] = useState<string>('all')

  useEffect(() => {
    if (dataSources.length > 0) {
      fetchRecommendations()
    }
  }, [dataSources, projectId, sheetId])

  const fetchRecommendations = async () => {
    setLoading(true)
    console.log('SourceAwareRecommendations: Starting recommendation fetch for sources:', dataSources.map(s => s.name))
    
    // Clear previous recommendations to avoid stale data
    setRecommendations([])
    setSelectedSourceFilter('all') // Reset filter to show all sources
    
    try {
      const allRecommendations: SourcedRecommendation[] = []

      for (const source of dataSources) {
        try {
          let response
          
          if (source.type === 'sheet') {
            const sheetIdFromSource = source.id.replace('sheet-', '')
            console.log(`SourceAwareRecommendations: Fetching sheet recommendations for ID: ${sheetIdFromSource}`)
            response = await fetch(getApiUrl(`/sheets/${sheetIdFromSource}/recommendations`))
          } else if (source.type === 'transformation') {
            // Check if this is a join or AI transformation
            if (source.id.startsWith('join-')) {
              const joinId = source.id.replace('join-', '')
              console.log(`SourceAwareRecommendations: Fetching join recommendations for ID: ${joinId}`)
              response = await fetch(getApiUrl(`/joins/${joinId}/recommendations`))
            } else {
              const stepId = source.id.replace('transform-', '')
              console.log(`SourceAwareRecommendations: Fetching AI transformation recommendations for ID: ${stepId}`)
              response = await fetch(getApiUrl(`/ai-transformations/${stepId}/recommendations`))
            }
          } else if (source.type === 'project' && projectId) {
            console.log(`SourceAwareRecommendations: Fetching project recommendations for ID: ${projectId}`)
            response = await fetch(getApiUrl(`/projects/${projectId}/recommendations`))
          }

          if (response?.ok) {
            const data = await response.json()
            console.log(`SourceAwareRecommendations: Got ${data.recommendations?.length || 0} recommendations for ${source.name}`, data)
            const sourceRecommendations = (data.recommendations || []).map((rec: any) => ({
              ...rec,
              source
            }))
            allRecommendations.push(...sourceRecommendations)
          } else if (response) {
            console.error(`SourceAwareRecommendations: Failed to fetch recommendations for ${source.name}:`, response.status, response.statusText)
          }
        } catch (error) {
          console.error(`Error fetching recommendations for ${source.name}:`, error)
        }
      }

      console.log(`SourceAwareRecommendations: Final total recommendations: ${allRecommendations.length}`)
      setRecommendations(allRecommendations)
    } catch (error) {
      console.error('Error fetching recommendations:', error)
    } finally {
      setLoading(false)
    }
  }

  const getSourceIcon = (type: string) => {
    switch (type) {
      case 'sheet':
        return <FileText size={12} className="text-blue-600" />
      case 'transformation':
        return <Layers size={12} className="text-green-600" />
      case 'project':
        return <Database size={12} className="text-purple-600" />
      default:
        return <FileText size={12} className="text-gray-600" />
    }
  }

  const getSourceTypeLabel = (type: string) => {
    switch (type) {
      case 'sheet':
        return 'Sheet'
      case 'transformation':
        return 'Transform'
      case 'project':
        return 'Combined'
      default:
        return 'Data'
    }
  }

  const filteredRecommendations = selectedSourceFilter === 'all' 
    ? recommendations 
    : recommendations.filter(rec => rec.source.id === selectedSourceFilter)

  const uniqueSourceTypes = Array.from(new Set(dataSources.map(s => s.type)))

  if (dataSources.length === 0) {
    return null
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Chart Recommendations</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchRecommendations}
            disabled={loading}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Source Filter */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Filter size={14} className="text-gray-500" />
          <span className="text-sm font-medium text-gray-700">Filter by data source:</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedSourceFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              selectedSourceFilter === 'all'
                ? 'bg-blue-100 text-blue-800 border border-blue-200'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All Sources ({recommendations.length})
          </button>
          {dataSources.map((source) => {
            const count = recommendations.filter(rec => rec.source.id === source.id).length
            return (
              <button
                key={source.id}
                onClick={() => setSelectedSourceFilter(source.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  selectedSourceFilter === source.id
                    ? 'bg-blue-100 text-blue-800 border border-blue-200'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {getSourceIcon(source.type)}
                {source.name} ({count})
              </button>
            )
          })}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <RefreshCw size={20} className="animate-spin text-blue-600 mr-2" />
          <span className="text-gray-600">Generating recommendations...</span>
        </div>
      ) : filteredRecommendations.length === 0 ? (
        <div className="text-center py-8">
          <div className="text-gray-400 mb-2">
            <Filter size={24} className="mx-auto" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No recommendations found</h3>
          <p className="text-gray-600">
            {selectedSourceFilter === 'all' 
              ? 'No chart recommendations available for the selected data sources.'
              : 'No chart recommendations available for this specific data source.'
            }
          </p>
        </div>
      ) : (
        <>
          <p className="text-gray-600 mb-6">
            Based on your data sources, here are chart suggestions that could reveal insights. 
            Each recommendation shows its source and can be customized after creation.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRecommendations.map((recommendation, index) => (
              <div key={`${recommendation.source.id}-${index}`} className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900 mb-2">{recommendation.title}</h3>
                    <div className="flex items-center gap-1 mb-2">
                      <span className="inline-block px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded capitalize">
                        {recommendation.type} chart
                      </span>
                    </div>
                    {/* Source Attribution */}
                    <div className="flex items-center gap-1 text-xs bg-gray-50 text-gray-600 px-2 py-1 rounded mb-2">
                      {getSourceIcon(recommendation.source.type)}
                      <span className="font-medium">{getSourceTypeLabel(recommendation.source.type)}:</span>
                      <span>{recommendation.source.name}</span>
                    </div>
                  </div>
                </div>
                
                <p className="text-sm text-gray-600 mb-3">{recommendation.description}</p>
                <p className="text-xs text-gray-500 mb-4">{recommendation.reason}</p>
                
                <div className="flex items-center justify-between">
                  <div className="text-xs text-gray-500">
                    <strong>X:</strong> {recommendation.x_axis}
                    {recommendation.y_axis && (
                      <>
                        <br />
                        <strong>Y:</strong> {recommendation.y_axis}
                      </>
                    )}
                  </div>
                  <button
                    onClick={() => onCreateChart(recommendation)}
                    className="bg-blue-50 hover:bg-blue-100 text-blue-600 px-3 py-2 rounded text-sm font-medium transition-colors flex items-center gap-1"
                  >
                    <Plus size={12} />
                    Create
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}