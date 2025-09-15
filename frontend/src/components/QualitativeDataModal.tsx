'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { X, Brain, AlertCircle, Info } from 'lucide-react'

interface QualitativeDataModalProps {
  isOpen: boolean
  onClose: () => void
  onCreateOperation: (operationConfig: {
    name: string
    source_table_id: number
    source_table_type: 'sheet' | 'transformation'
    qualitative_column: string
    analysis_type: 'sentiment' | 'summarization'
    aggregation_column?: string
    output_table_name?: string
  }) => Promise<void>
  position: { x: number; y: number }
  availableTables: Array<{
    id: number
    name: string
    columns: string[]
    type: 'sheet' | 'transformation'
  }>
  initialOperation?: {
    id: number
    name: string
    source_table_id: number
    source_table_type: string
    qualitative_column: string
    analysis_type: string
    aggregation_column?: string
    output_table_name?: string
  }
}

export default function QualitativeDataModal({
  isOpen,
  onClose,
  onCreateOperation,
  position,
  availableTables,
  initialOperation
}: QualitativeDataModalProps) {
  const [operationName, setOperationName] = useState(initialOperation?.name || '')
  const [sourceTableId, setSourceTableId] = useState<number | null>(initialOperation?.source_table_id || null)
  const [sourceTableType, setSourceTableType] = useState<'sheet' | 'transformation' | ''>('')
  const [qualitativeColumn, setQualitativeColumn] = useState(initialOperation?.qualitative_column || '')
  const [analysisType, setAnalysisType] = useState<'sentiment' | 'summarization' | ''>(
    (initialOperation?.analysis_type as 'sentiment' | 'summarization') || ''
  )
  const [aggregationColumn, setAggregationColumn] = useState(initialOperation?.aggregation_column || '')
  const [outputTableName, setOutputTableName] = useState(initialOperation?.output_table_name || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  
  // Drag functionality
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [modalPosition, setModalPosition] = useState(position)

  // Get available columns for the selected table
  const selectedTable = availableTables.find(table => 
    table.id === sourceTableId && table.type === sourceTableType
  )
  const availableColumns = selectedTable?.columns || []

  // Initialize form if editing
  useEffect(() => {
    if (initialOperation) {
      setOperationName(initialOperation.name)
      setSourceTableId(initialOperation.source_table_id)
      setSourceTableType(initialOperation.source_table_type as 'sheet' | 'transformation')
      setQualitativeColumn(initialOperation.qualitative_column)
      setAnalysisType(initialOperation.analysis_type as 'sentiment' | 'summarization')
      setAggregationColumn(initialOperation.aggregation_column || '')
      setOutputTableName(initialOperation.output_table_name || '')
    }
  }, [initialOperation])

  // Reset qualitative column when source table changes
  useEffect(() => {
    setQualitativeColumn('')
    setAggregationColumn('')
  }, [sourceTableId, sourceTableType])

  // Update modal position when prop changes
  useEffect(() => {
    setModalPosition(position)
  }, [position])

  // Mouse drag handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    })
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const newX = Math.max(0, Math.min(window.innerWidth - 448, e.clientX - dragOffset.x))
        const newY = Math.max(0, Math.min(window.innerHeight - 200, e.clientY - dragOffset.y))
        setModalPosition({ x: newX, y: newY })
      }
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, dragOffset])

  const handleSourceTableChange = (tableId: string) => {
    const [type, id] = tableId.split(':')
    setSourceTableId(parseInt(id))
    setSourceTableType(type as 'sheet' | 'transformation')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    // Validation
    if (!operationName.trim()) {
      setError('Please enter an operation name')
      return
    }
    
    if (!sourceTableId || !sourceTableType) {
      setError('Please select a source table')
      return
    }
    
    if (!qualitativeColumn) {
      setError('Please select a qualitative data column')
      return
    }
    
    if (!analysisType) {
      setError('Please select an analysis type')
      return
    }

    setLoading(true)
    try {
      const operationConfig = {
        name: operationName.trim(),
        source_table_id: sourceTableId,
        source_table_type: sourceTableType,
        qualitative_column: qualitativeColumn,
        analysis_type: analysisType,
        aggregation_column: aggregationColumn.trim() || undefined,
        output_table_name: outputTableName.trim() || undefined
      }
      console.log('DEBUG: Creating qualitative operation with config:', operationConfig)
      await onCreateOperation(operationConfig)
      
      // Reset form
      setOperationName('')
      setSourceTableId(null)
      setSourceTableType('')
      setQualitativeColumn('')
      setAnalysisType('')
      setAggregationColumn('')
      setOutputTableName('')
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to create qualitative data operation')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div 
        className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto"
        style={{ 
          position: 'absolute',
          left: modalPosition.x,
          top: modalPosition.y,
          cursor: isDragging ? 'grabbing' : 'default',
          width: '448px'
        }}
      >
        {/* Header */}
        <div 
          className="flex items-center justify-between p-4 border-b border-gray-200 cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center gap-2">
            <Brain className="text-blue-600" size={20} />
            <h3 className="text-lg font-semibold text-gray-900">
              {initialOperation ? 'Edit' : 'Create'} Qualitative Analysis
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <X size={24} />
          </button>
        </div>
        
        {/* Content */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
              <AlertCircle className="text-red-600" size={16} />
              <span className="text-red-800 text-sm">{error}</span>
            </div>
          )}

          {/* Operation Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Analysis Name *
            </label>
            <input
              type="text"
              value={operationName}
              onChange={(e) => setOperationName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Customer Feedback Sentiment"
              required
            />
          </div>

          {/* Source Table */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Source Table *
            </label>
            <select
              value={sourceTableId && sourceTableType ? `${sourceTableType}:${sourceTableId}` : ''}
              onChange={(e) => handleSourceTableChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Select source table...</option>
              {availableTables.map(table => (
                <option key={`${table.type}:${table.id}`} value={`${table.type}:${table.id}`}>
                  {table.name} ({table.type === 'sheet' ? 'Sheet' : 'Transformation'})
                </option>
              ))}
            </select>
          </div>

          {/* Qualitative Column */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Qualitative Data Column *
            </label>
            <select
              value={qualitativeColumn}
              onChange={(e) => setQualitativeColumn(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              disabled={!selectedTable}
            >
              <option value="">
                {selectedTable ? 'Select column with text data...' : 'First select a source table'}
              </option>
              {availableColumns.map(column => (
                <option key={column} value={column}>
                  {column}
                </option>
              ))}
            </select>
            {selectedTable && availableColumns.length === 0 && (
              <p className="text-sm text-gray-500 mt-1">
                No columns available in selected table
              </p>
            )}
          </div>

          {/* Analysis Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Analysis Type *
            </label>
            <select
              value={analysisType}
              onChange={(e) => setAnalysisType(e.target.value as 'sentiment' | 'summarization')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Select analysis type...</option>
              <option value="sentiment">
                Sentiment Analysis - Analyze positive/negative sentiment
              </option>
              <option value="summarization">
                Summarization - Generate summary and insights
              </option>
            </select>
          </div>

          {/* Aggregation Column - Only show for summarization */}
          {analysisType === 'summarization' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                Aggregation Column (Optional)
                <div className="group relative">
                  <Info size={14} className="text-gray-400 cursor-help" />
                  <div className="absolute left-0 bottom-6 hidden group-hover:block bg-gray-800 text-white text-xs rounded-lg px-3 py-2 w-64 z-10">
                    <div className="mb-1 font-medium">Group-by Analysis:</div>
                    <div>• No column: Summarize entire dataset as one group</div>
                    <div>• Select column: Group reviews by column values and create separate summaries for each category</div>
                    <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800"></div>
                  </div>
                </div>
              </label>
              <select
                value={aggregationColumn}
                onChange={(e) => setAggregationColumn(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={!selectedTable}
              >
                <option value="">
                  {selectedTable ? 'No grouping - analyze entire dataset...' : 'First select a source table'}
                </option>
                {availableColumns.map(column => (
                  <option key={column} value={column}>
                    {column}
                  </option>
                ))}
              </select>
              {aggregationColumn && (
                <p className="text-sm text-blue-600 mt-1">
                  ✓ Will create separate summaries for each unique value in "{aggregationColumn}"
                </p>
              )}
            </div>
          )}

          {/* Analysis Type Description */}
          {analysisType && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="text-sm text-blue-800">
                {analysisType === 'sentiment' ? (
                  <>
                    <strong>Sentiment Analysis:</strong> This will add two new columns to your data:
                    <ul className="list-disc list-inside mt-1 ml-2">
                      <li><code>sentiment_label</code> - Positive, Negative, or Neutral</li>
                      <li><code>sentiment_confidence</code> - Confidence score (0.0 to 1.0)</li>
                    </ul>
                  </>
                ) : (
                  <>
                    <strong>Summarization:</strong> This will create a new summary table with:
                    <ul className="list-disc list-inside mt-1 ml-2">
                      <li><code>overall_summary</code> - Comprehensive analysis</li>
                      <li><code>bullet_highlights</code> - Key insights</li>
                      <li><code>suggested_actions</code> - Recommended next steps</li>
                      <li><code>method_note</code> - Analysis limitations</li>
                    </ul>
                    {aggregationColumn && (
                      <div className="mt-2 p-2 bg-blue-100 rounded border">
                        <strong>Group-by Analysis:</strong> Each unique value in "{aggregationColumn}" will get its own summary row.
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Output Table Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Output Table Name (Optional)
            </label>
            <input
              type="text"
              value={outputTableName}
              onChange={(e) => setOutputTableName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., customer_feedback_analysis"
            />
            <p className="text-sm text-gray-500 mt-1">
              Custom name for the output table. If left empty, a name will be generated automatically.
            </p>
          </div>

          {/* Processing Info */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <div className="text-sm text-gray-600">
              <strong>Processing Info:</strong>
              <ul className="list-disc list-inside mt-1 ml-2">
                <li>Data will be processed in batches of 100 records</li>
                <li>Large datasets may take several minutes to process</li>
                <li>Uses GPT-4o-mini for analysis</li>
              </ul>
            </div>
          </div>
        </form>
        
        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating...' : (initialOperation ? 'Update Analysis' : 'Create Analysis')}
          </button>
        </div>
      </div>
    </div>
  )
}