'use client'

import React, { useState } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { 
  Zap, 
  Play, 
  Pause, 
  CheckCircle, 
  AlertCircle, 
  Code, 
  Eye, 
  EyeOff,
  Edit3,
  Trash2,
  Table
} from 'lucide-react'

interface TransformationData {
  step: {
    id: number
    step_name: string
    user_prompt: string
    code_summary: string
    generated_code?: string
    code_explanation?: string
    status: 'draft' | 'ready' | 'running' | 'completed' | 'failed'
    error_message?: string
    execution_time_ms?: number
    output_columns?: string[]
  }
  onUpdate?: (stepId: number, updates: any) => Promise<void>
  onExecute?: (stepId: number) => Promise<void>
  onDelete?: (stepId: number) => Promise<void>
  onViewData?: (stepId: number, stepName: string, status: string) => void
}

export default function TransformationNode({ data }: NodeProps<TransformationData>) {
  const { step, onUpdate, onExecute, onDelete, onViewData } = data
  const [showCode, setShowCode] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(step.step_name)
  const [editPrompt, setEditPrompt] = useState(step.user_prompt)
  
  // Extract table name from code_explanation
  const getOutputTableName = () => {
    if (!step.code_explanation) return null
    const lines = step.code_explanation.split('\n')
    for (const line of lines) {
      if (line.startsWith('Output table:')) {
        return line.split(':', 2)[1]?.trim()
      }
    }
    return null
  }
  
  const [customTableName, setCustomTableName] = useState('')

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'text-gray-600 bg-gray-50 border-gray-300'
      case 'ready': return 'text-blue-600 bg-blue-50 border-blue-300'
      case 'running': return 'text-yellow-600 bg-yellow-50 border-yellow-300'
      case 'completed': return 'text-green-600 bg-green-50 border-green-300'
      case 'failed': return 'text-red-600 bg-red-50 border-red-300'
      default: return 'text-gray-600 bg-gray-50 border-gray-300'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running': return <Pause size={14} className="animate-spin" />
      case 'completed': return <CheckCircle size={14} />
      case 'failed': return <AlertCircle size={14} />
      default: return <Zap size={14} />
    }
  }

  const handleSaveEdit = async () => {
    const hasChanges = editName !== step.step_name || editPrompt !== step.user_prompt || customTableName.trim()
    
    if (onUpdate && hasChanges) {
      const updates: any = {}
      
      // Only include changed fields
      if (editName !== step.step_name) {
        updates.step_name = editName
      }
      if (editPrompt !== step.user_prompt) {
        updates.user_prompt = editPrompt
      }
      if (customTableName.trim()) {
        updates.custom_table_name = customTableName.trim()
      }
      
      // Only make API call if there are actual changes
      if (Object.keys(updates).length > 0) {
        await onUpdate(step.id, updates)
      }
    }
    setIsEditing(false)
  }

  const handleExecute = async () => {
    if (onExecute) {
      await onExecute(step.id)
    }
  }

  return (
    <div className={`bg-white border-2 rounded-lg shadow-lg min-w-[300px] max-w-[400px] hover:shadow-xl transition-shadow ${getStatusColor(step.status)}`}>
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        id={`step-${step.id}-input`}
        style={{
          background: '#10B981',
          width: 12,
          height: 12,
          border: '2px solid white',
        }}
      />

      {/* Header */}
      <div className={`px-4 py-3 rounded-t-lg flex items-center gap-3 ${getStatusColor(step.status)}`}>
        <div className="bg-white/20 p-1 rounded">
          {getStatusIcon(step.status)}
        </div>
        <div className="flex-1">
          {isEditing ? (
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="font-semibold text-sm bg-transparent border-none outline-none w-full"
              onBlur={handleSaveEdit}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
              autoFocus
            />
          ) : (
            <h3 className="font-semibold text-sm truncate" title={step.step_name}>
              {step.step_name}
            </h3>
          )}
          <div className="text-xs opacity-75 capitalize">
            {step.status} {step.execution_time_ms && `• ${step.execution_time_ms}ms`}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 bg-white">
        <div className="space-y-3">
          {/* Summary */}
          <div>
            <div className="text-xs font-medium text-gray-700 mb-1">AI Summary:</div>
            <p className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
              {step.code_summary || 'Generating transformation...'}
            </p>
          </div>

          {/* User Prompt */}
          <div>
            <div className="text-xs font-medium text-gray-700 mb-1">Your Request:</div>
            {isEditing ? (
              <textarea
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                className="text-sm text-gray-600 w-full p-2 border border-gray-300 rounded resize-none"
                rows={2}
                onBlur={handleSaveEdit}
              />
            ) : (
              <p className="text-sm text-gray-600 italic">
                "{step.user_prompt}"
              </p>
            )}
          </div>

          {/* Error Message */}
          {step.error_message && (
            <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
              <strong>Error:</strong> {step.error_message}
            </div>
          )}

          {/* Output Table Name */}
          {getOutputTableName() && step.status === 'completed' && (
            <div>
              <div className="text-xs font-medium text-gray-700 mb-1">Output Table:</div>
              <div className="text-sm bg-green-50 border border-green-200 p-2 rounded font-mono">
                📊 {getOutputTableName()}
              </div>
              {step.output_columns && step.output_columns.length > 0 && (
                <div className="text-xs text-gray-500 mt-1">
                  {step.output_columns.length} columns: {step.output_columns.slice(0, 3).join(', ')}
                  {step.output_columns.length > 3 && ` +${step.output_columns.length - 3} more`}
                </div>
              )}
            </div>
          )}

          {/* Custom Table Name Input */}
          {isEditing && (
            <div>
              <div className="text-xs font-medium text-gray-700 mb-1">Custom Table Name (optional):</div>
              <input
                type="text"
                value={customTableName}
                onChange={(e) => setCustomTableName(e.target.value)}
                placeholder="e.g., my_custom_table"
                className="text-sm w-full p-2 border border-gray-300 rounded"
              />
              <div className="text-xs text-gray-500 mt-1">
                Leave empty to use auto-generated name
              </div>
            </div>
          )}

          {/* Generated Code (Collapsible) */}
          {step.generated_code && (
            <div>
              <button
                onClick={() => setShowCode(!showCode)}
                className="flex items-center gap-2 text-xs font-medium text-gray-700 hover:text-gray-900 transition-colors"
              >
                <Code size={12} />
                {showCode ? 'Hide' : 'Show'} Generated Code
                {showCode ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
              {showCode && (
                <pre className="text-xs bg-gray-900 text-gray-100 p-3 rounded mt-2 overflow-x-auto max-h-32">
                  <code>{step.generated_code}</code>
                </pre>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
              title="Edit step"
            >
              <Edit3 size={14} />
            </button>
            {step.status === 'completed' && onViewData && (
              <button
                onClick={() => onViewData(step.id, step.step_name, step.status)}
                className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                title="View output data"
              >
                <Table size={14} />
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete(step.id)}
                className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                title="Delete step"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        id={`step-${step.id}-output`}
        style={{
          background: '#10B981',
          width: 12,
          height: 12,
          border: '2px solid white',
        }}
      />
    </div>
  )
}