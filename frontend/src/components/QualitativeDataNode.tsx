'use client'

import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { Handle, Position, NodeResizer } from 'reactflow'
import { Brain, Play, CheckCircle, AlertCircle, Edit3, Trash2, Table, Loader2, AlertTriangle } from 'lucide-react'

interface QualitativeDataNodeData {
  operation: {
    id: number
    name: string
    source_table_id: number
    source_table_type: string
    qualitative_column: string
    analysis_type: string // 'sentiment', 'summarization', or 'theme_extraction'
    aggregation_column?: string
    summarize_sentiment_analysis?: boolean
    sentiment_column?: string
    status: 'pending' | 'running' | 'completed' | 'failed'
    error_message?: string
    output_table_name?: string
    total_records_processed?: number
    batch_count?: number
    execution_time_ms?: number
  }
  onViewData?: (operationId: number, operationName: string) => void
  onEdit?: (operationId: number) => void
  onDelete?: (operationId: number) => void
  onExecute?: (operationId: number) => void
  onUpdate?: (operationId: number, updates: any) => Promise<void>
  availableTables?: Array<{
    id: number
    name: string
    columns: string[]
    type: 'sheet' | 'transformation'
  }>
}

interface QualitativeDataNodeProps {
  data: QualitativeDataNodeData
  selected: boolean
}

export default function QualitativeDataNode({ data, selected }: QualitativeDataNodeProps) {
  const { operation, onViewData, onEdit, onDelete, onExecute, availableTables } = data
  const [isExecuting, setIsExecuting] = useState(false)

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-blue-500'
      case 'failed':
        return 'bg-red-500'
      case 'running':
        return 'bg-yellow-500'
      case 'pending':
      default:
        return 'bg-purple-500'
    }
  }

  const getStatusDisplayText = (status: string) => {
    switch (status) {
      case 'pending': return 'Ready to execute'
      case 'running': return 'Executing...'
      case 'completed': return 'Execution complete'
      case 'failed': return 'Execution failed'
      default: return 'Ready to execute'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="text-white" size={14} />
      case 'failed':
        return <AlertCircle className="text-white" size={14} />
      case 'running':
        return <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
      case 'pending':
      default:
        return <Brain className="text-white" size={14} />
    }
  }

  const getAnalysisTypeDisplayText = (analysisType: string) => {
    switch (analysisType) {
      case 'sentiment':
        return 'Sentiment Analysis'
      case 'summarization':
        return 'Summarization'
      case 'theme_extraction':
        return 'Theme Extraction'
      default:
        return 'Qualitative Analysis'
    }
  }

  const handleExecute = async () => {
    if (!onExecute || isExecuting) return
    
    setIsExecuting(true)
    try {
      await onExecute(operation.id)
    } finally {
      setIsExecuting(false)
    }
  }

  return (
    <>
      <div className={`bg-white border-2 rounded-lg shadow-lg min-w-[320px] hover:shadow-xl transition-shadow relative ${
        selected ? 'ring-2 ring-blue-300 shadow-xl' : ''
      }`}>
        <NodeResizer 
          minWidth={320} 
          minHeight={200}
          handleStyle={{
            width: '12px',
            height: '12px',
            borderRadius: '2px',
            backgroundColor: '#3B82F6',
            border: '2px solid white',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}
          lineStyle={{
            borderColor: '#3B82F6',
            borderWidth: '2px'
          }}
        />
        
        {/* Input Handle */}
        <Handle
          type="target"
          position={Position.Left}
          id={`qualitative-${operation.id}-input`}
          style={{
            background: '#3B82F6',
            width: 12,
            height: 12,
            border: '2px solid white',
          }}
        />

        {/* Header */}
        <div className={`px-4 py-3 rounded-t-lg flex items-center gap-3 ${getStatusColor(operation.status)}`}>
          <div className="bg-white/20 p-1 rounded">
            {getStatusIcon(operation.status)}
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-sm truncate text-white" title={operation.name}>
              {operation.name}
            </h3>
            <div className="text-xs opacity-75 text-white">
              {getStatusDisplayText(operation.status)} • {getAnalysisTypeDisplayText(operation.analysis_type)}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 bg-white">
          <div className="space-y-3">
            {/* Analysis Configuration */}
            <div>
              <div className="text-xs font-medium text-gray-700 mb-1">Analysis Setup:</div>
              <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded space-y-1">
                <div><strong>Data Column:</strong> {operation.qualitative_column}</div>
                <div><strong>Analysis Type:</strong> {getAnalysisTypeDisplayText(operation.analysis_type)}</div>
                {operation.aggregation_column && operation.analysis_type === 'summarization' && (
                  <div><strong>Group By:</strong> {operation.aggregation_column}</div>
                )}
                {operation.analysis_type === 'summarization' && operation.summarize_sentiment_analysis && (
                  <div><strong>Sentiment Stats:</strong> Enabled{operation.sentiment_column ? ` (using ${operation.sentiment_column})` : ''}</div>
                )}
                <div><strong>Source:</strong> {(() => {
                  const table = availableTables?.find(t => t.id === operation.source_table_id && t.type === operation.source_table_type)
                  
                  // Debug logging
                  console.log('QualitativeDataNode source lookup:', {
                    source_table_id: operation.source_table_id,
                    source_table_type: operation.source_table_type,
                    availableTables: availableTables,
                    foundTable: table
                  })
                  
                  return table ? table.name : `${operation.source_table_type === 'sheet' ? 'Sheet' : 'Transformation'} (ID: ${operation.source_table_id})`
                })()}</div>
              </div>
            </div>

            {/* Processing Stats */}
            {(operation.total_records_processed || operation.batch_count) && operation.status === 'completed' && (
              <div>
                <div className="text-xs font-medium text-gray-700 mb-1">Processing Stats:</div>
                <div className="text-sm text-gray-600 bg-blue-50 p-2 rounded space-y-1">
                  {operation.total_records_processed && (
                    <div><strong>Records Processed:</strong> {operation.total_records_processed.toLocaleString()}</div>
                  )}
                  {operation.batch_count && (
                    <div><strong>Batches:</strong> {operation.batch_count} (100 per batch)</div>
                  )}
                  {operation.execution_time_ms && (
                    <div><strong>Processing Time:</strong> {(operation.execution_time_ms / 1000).toFixed(1)}s</div>
                  )}
                </div>
              </div>
            )}

            {/* Output Table Name */}
            {operation.output_table_name && operation.status === 'completed' && (
              <div>
                <div className="text-xs font-medium text-gray-700 mb-1">Output Table:</div>
                <div 
                  className={`text-sm bg-green-50 border border-green-200 p-2 rounded font-mono ${
                    onViewData && operation.status === 'completed' && !operation.error_message
                      ? 'cursor-pointer hover:bg-green-100 transition-colors'
                      : ''
                  }`}
                  onClick={onViewData && operation.status === 'completed' && !operation.error_message ? () => onViewData(operation.id, operation.name) : undefined}
                  title={onViewData && operation.status === 'completed' && !operation.error_message ? 'Click to view data' : undefined}
                >
                  🧠 {operation.output_table_name}
                </div>
              </div>
            )}

            {/* Error Message */}
            {operation.status === 'failed' && operation.error_message && (
              <div>
                <div className="text-xs font-medium text-red-700 mb-1 flex items-center gap-1">
                  <AlertTriangle size={12} />
                  Error Message:
                </div>
                <div className="text-sm bg-red-50 border border-red-200 p-2 rounded text-red-800">
                  {operation.error_message}
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
            <div className="flex items-center gap-1">
              <button
                onClick={() => onEdit && operation.status !== 'running' && onEdit(operation.id)}
                className={`p-2 rounded transition-colors ${
                  operation.status === 'running'
                    ? 'text-gray-400 cursor-not-allowed'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
                title={
                  operation.status === 'running'
                    ? "Cannot edit while operation is running"
                    : "Edit qualitative operation"
                }
                disabled={operation.status === 'running'}
              >
                <Edit3 size={14} />
              </button>
              {onViewData && (
                <button
                  onClick={operation.status === 'completed' && !operation.error_message ? () => onViewData(operation.id, operation.name) : undefined}
                  className={`p-2 rounded transition-colors ${
                    operation.status === 'completed' && !operation.error_message
                      ? 'text-blue-500 hover:text-blue-700 hover:bg-blue-50' 
                      : 'text-gray-400 cursor-not-allowed'
                  }`}
                  title={
                    operation.status === 'completed' && !operation.error_message
                      ? "View execution results" 
                      : operation.error_message 
                        ? "Cannot view results - execution has errors" 
                        : "Run the execution to see results"
                  }
                  disabled={operation.status !== 'completed' || !!operation.error_message}
                >
                  <Table size={14} />
                </button>
              )}
              {onDelete && (
                <button
                  onClick={() => onDelete(operation.id)}
                  className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                  title="Delete qualitative operation"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            
            {/* Execute Button - Only show when not running */}
            <div className="flex items-center gap-1">
              {onExecute && operation.status !== 'running' && !isExecuting && (
                <button
                  onClick={handleExecute}
                  disabled={operation.status === 'running' || isExecuting}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                    operation.status === 'running' || isExecuting
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                  title="Run qualitative operation"
                >
                  <Play size={12} />
                  Execute
                </button>
              )}
              {(isExecuting || operation.status === 'running') && (
                <button
                  disabled
                  className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium bg-gray-300 text-gray-500 cursor-not-allowed"
                  title="Running execution..."
                >
                  <Loader2 size={12} className="animate-spin" />
                  Executing...
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Output Handle */}
        <Handle
          type="source"
          position={Position.Right}
          id={`qualitative-${operation.id}-output`}
          style={{
            background: '#3B82F6',
            width: 12,
            height: 12,
            border: '2px solid white',
          }}
        />
      </div>
    </>
  )
}