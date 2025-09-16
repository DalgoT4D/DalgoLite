'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Handle, Position, NodeProps, NodeResizer } from 'reactflow'
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
  Table,
  X,
  ExternalLink
} from 'lucide-react'

interface TransformationData {
  step: {
    id: number
    step_name: string
    user_prompt: string
    code_summary: string
    generated_code?: string
    code_explanation?: string
    output_table_name?: string
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
  
  // DEBUG: Log step data to see what we're actually getting
  console.log('TransformationNode step data:', {
    id: step.id,
    status: step.status,
    output_table_name: step.output_table_name,
    onViewData: !!onViewData
  })
  const [showCodeModal, setShowCodeModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editName, setEditName] = useState(step.step_name)
  const [editPrompt, setEditPrompt] = useState(step.user_prompt)
  const [editTableName, setEditTableName] = useState('')
  
  // Modal drag states
  const [editModalPosition, setEditModalPosition] = useState({ x: 0, y: 0 })
  const [isEditModalDragging, setIsEditModalDragging] = useState(false)
  const [editModalDragOffset, setEditModalDragOffset] = useState({ x: 0, y: 0 })
  
  const [codeModalPosition, setCodeModalPosition] = useState({ x: 0, y: 0 })
  const [isCodeModalDragging, setIsCodeModalDragging] = useState(false)
  const [codeModalDragOffset, setCodeModalDragOffset] = useState({ x: 0, y: 0 })
  
  // Get output table name - use actual field or extract from code_explanation as fallback
  const getOutputTableName = () => {
    console.log('DEBUG getOutputTableName:', {
      output_table_name: step.output_table_name,
      code_explanation: step.code_explanation
    })
    
    // First try to use the actual output_table_name field if it exists
    if (step.output_table_name) {
      console.log('Using output_table_name:', step.output_table_name)
      return step.output_table_name
    }
    
    // Fallback to parsing from code_explanation (for backward compatibility)
    if (!step.code_explanation) {
      console.log('No code_explanation found')
      return null
    }
    const lines = step.code_explanation.split('\n')
    for (const line of lines) {
      if (line.startsWith('Output table:')) {
        const tableName = line.split(':', 2)[1]?.trim()
        console.log('Extracted from code_explanation:', tableName)
        return tableName
      }
    }
    console.log('No table name found in code_explanation')
    return null
  }
  

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

  const getStatusDisplayText = (status: string) => {
    switch (status) {
      case 'draft': return 'Run pending'
      case 'ready': return 'Ready'
      case 'running': return 'Running'
      case 'completed': return 'Completed'
      case 'failed': return 'Failed'
      default: return 'Run pending'
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
    const hasChanges = editName !== step.step_name || editPrompt !== step.user_prompt || editTableName.trim()
    
    if (onUpdate && hasChanges) {
      const updates: any = {}
      
      // Only include changed fields
      if (editName !== step.step_name) {
        updates.step_name = editName
      }
      if (editPrompt !== step.user_prompt) {
        updates.user_prompt = editPrompt
      }
      if (editTableName.trim()) {
        updates.output_table_name = editTableName.trim()
      }
      
      // Only make API call if there are actual changes
      if (Object.keys(updates).length > 0) {
        await onUpdate(step.id, updates)
        
        // Auto-execute the node after saving changes to ensure new changes reflect
        if (onExecute && step.status === 'completed') {
          await onExecute(step.id)
        }
      }
    }
    setShowEditModal(false)
    // Reset the form values to current step values
    setEditName(step.step_name)
    setEditPrompt(step.user_prompt)
    setEditTableName(step.output_table_name || '')
  }

  const handleExecute = async () => {
    if (onExecute) {
      await onExecute(step.id)
    }
  }
  
  // Edit modal drag handlers
  const handleEditModalMouseDown = useCallback((e: React.MouseEvent) => {
    setIsEditModalDragging(true)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setEditModalDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    })
  }, [])

  // Code modal drag handlers
  const handleCodeModalMouseDown = useCallback((e: React.MouseEvent) => {
    setIsCodeModalDragging(true)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setCodeModalDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    })
  }, [])

  // Sync form values with step data when step changes
  useEffect(() => {
    console.log('DEBUG: useEffect triggered with step data:', {
      step_name: step.step_name,
      user_prompt: step.user_prompt,
      output_table_name: step.output_table_name
    })
    setEditName(step.step_name)
    setEditPrompt(step.user_prompt)
    setEditTableName(step.output_table_name || '')
    console.log('DEBUG: Set editTableName to:', step.output_table_name || '')
  }, [step.step_name, step.user_prompt, step.output_table_name])

  // Initialize modal positions to center of screen
  useEffect(() => {
    const centerX = window.innerWidth / 2 - 200 // Approximate half modal width
    const centerY = window.innerHeight / 2 - 150 // Approximate half modal height
    setEditModalPosition({ x: Math.max(20, centerX), y: Math.max(20, centerY) })
    setCodeModalPosition({ x: Math.max(20, centerX + 50), y: Math.max(20, centerY + 50) }) // Offset slightly
  }, [])

  // Edit modal drag effect
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isEditModalDragging) {
        const newX = Math.max(0, Math.min(window.innerWidth - 400, e.clientX - editModalDragOffset.x))
        const newY = Math.max(0, Math.min(window.innerHeight - 100, e.clientY - editModalDragOffset.y))
        setEditModalPosition({ x: newX, y: newY })
      }
    }

    const handleMouseUp = () => {
      setIsEditModalDragging(false)
    }

    if (isEditModalDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isEditModalDragging, editModalDragOffset])

  // Code modal drag effect
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isCodeModalDragging) {
        const newX = Math.max(0, Math.min(window.innerWidth - 800, e.clientX - codeModalDragOffset.x))
        const newY = Math.max(0, Math.min(window.innerHeight - 100, e.clientY - codeModalDragOffset.y))
        setCodeModalPosition({ x: newX, y: newY })
      }
    }

    const handleMouseUp = () => {
      setIsCodeModalDragging(false)
    }

    if (isCodeModalDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isCodeModalDragging, codeModalDragOffset])

  return (
    <div className={`bg-white border-2 rounded-lg shadow-lg min-w-[300px] hover:shadow-xl transition-shadow relative ${getStatusColor(step.status)}`}>
      {/* Node Resizer */}
      <NodeResizer 
        minWidth={300} 
        minHeight={200}
        handleStyle={{
          width: '12px',
          height: '12px',
          borderRadius: '2px',
          backgroundColor: '#10B981',
          border: '2px solid white',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}
        lineStyle={{
          borderColor: '#10B981',
          borderWidth: '2px'
        }}
      />
      
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
          <h3 className="font-semibold text-sm truncate" title={step.step_name}>
            {step.step_name}
          </h3>
          <div className="text-xs opacity-75">
            {getStatusDisplayText(step.status)} {step.execution_time_ms && `• ${step.execution_time_ms}ms`}
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
            <p className="text-sm text-gray-600 italic">
              "{step.user_prompt}"
            </p>
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
              <div 
                className={`text-sm bg-green-50 border border-green-200 p-2 rounded font-mono ${
                  onViewData && step.status === 'completed' && !step.error_message
                    ? 'cursor-pointer hover:bg-green-100 transition-colors'
                    : ''
                }`}
                onClick={onViewData && step.status === 'completed' && !step.error_message ? () => onViewData(step.id, step.step_name, step.status) : undefined}
                title={onViewData && step.status === 'completed' && !step.error_message ? 'Click to view data' : undefined}
              >
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


          {/* Generated Code Button */}
          {step.generated_code && (
            <div>
              <button
                onClick={() => setShowCodeModal(true)}
                className="flex items-center gap-2 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
              >
                <Code size={12} />
                View Generated Code
                <ExternalLink size={12} />
              </button>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                console.log('DEBUG: Edit button clicked, setting values:', {
                  step_name: step.step_name,
                  user_prompt: step.user_prompt,  
                  output_table_name: step.output_table_name
                })
                setEditName(step.step_name)
                setEditPrompt(step.user_prompt)
                setEditTableName(step.output_table_name || '')
                setShowEditModal(true)
              }}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
              title="Edit step"
            >
              <Edit3 size={14} />
            </button>
            {onViewData && (
              <button
                onClick={step.status === 'completed' && !step.error_message ? () => onViewData(step.id, step.step_name, step.status) : undefined}
                className={`p-2 rounded transition-colors ${
                  step.status === 'completed' && !step.error_message
                    ? 'text-blue-500 hover:text-blue-700 hover:bg-blue-50' 
                    : 'text-gray-400 cursor-not-allowed'
                }`}
                title={
                  step.status === 'completed' && !step.error_message
                    ? "View output data" 
                    : step.error_message 
                      ? "Cannot view data - step has errors" 
                      : "Run the node to see the results"
                }
                disabled={step.status !== 'completed' || !!step.error_message}
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
          
          {/* Execute Button - Only show for non-source nodes and when not running */}
          <div className="flex items-center gap-1">
            {onExecute && (step.status as any) !== 'running' && (
              <button
                onClick={handleExecute}
                disabled={(step.status as any) === 'running'}
                className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  (step.status as any) === 'running'
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
                title="Execute transformation"
              >
                <Play size={12} />
                Execute
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
      
      {/* Generated Code Modal */}
      {showCodeModal && step.generated_code && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div 
            className="bg-white rounded-lg shadow-xl max-w-4xl max-h-[80vh] w-full mx-4 flex flex-col absolute"
            style={{
              left: codeModalPosition.x,
              top: codeModalPosition.y,
              width: '800px',
              cursor: isCodeModalDragging ? 'grabbing' : 'default'
            }}
          >
            <div 
              className="flex items-center justify-between p-4 border-b border-gray-200 cursor-grab active:cursor-grabbing"
              onMouseDown={handleCodeModalMouseDown}
            >
              <div className="flex items-center gap-2">
                <Code className="text-green-600" size={20} />
                <h3 className="text-lg font-semibold text-gray-900">
                  Generated Code - {step.step_name}
                </h3>
              </div>
              <button
                onClick={() => setShowCodeModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-4" style={{ maxHeight: '60vh' }}>
              <pre className="text-sm bg-gray-900 text-gray-100 p-4 rounded overflow-auto whitespace-pre-wrap break-all">
                <code>{step.generated_code}</code>
              </pre>
            </div>
            
            <div className="flex justify-end gap-2 p-4 border-t border-gray-200">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(step.generated_code || '')
                  alert('Code copied to clipboard!')
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                Copy Code
              </button>
              <button
                onClick={() => setShowCodeModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
      
      {/* Edit Modal */}
      {showEditModal && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div 
            className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 absolute"
            style={{
              left: editModalPosition.x,
              top: editModalPosition.y,
              width: '400px',
              cursor: isEditModalDragging ? 'grabbing' : 'default'
            }}
          >
            <div 
              className="flex items-center justify-between p-4 border-b border-gray-200 cursor-grab active:cursor-grabbing"
              onMouseDown={handleEditModalMouseDown}
            >
              <div className="flex items-center gap-2">
                <Edit3 className="text-green-600" size={20} />
                <h3 className="text-lg font-semibold text-gray-900">Edit Transformation</h3>
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Step Name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Transformation Description
                </label>
                <textarea
                  value={editPrompt}
                  onChange={(e) => setEditPrompt(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Output Table Name (Optional)
                </label>
                <input
                  type="text"
                  value={editTableName}
                  onChange={(e) => setEditTableName(e.target.value)}
                  placeholder="e.g., cleaned_customer_data"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Leave empty to use auto-generated name
                </p>
              </div>
            </div>
            
            <div className="flex justify-end gap-2 p-4 border-t border-gray-200">
              <button
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}