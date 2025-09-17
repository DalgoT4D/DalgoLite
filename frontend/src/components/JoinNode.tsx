'use client'

import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { Handle, Position, NodeResizer } from 'reactflow'
import { Link, Table, Trash2, Edit3, Play, Sparkles, Loader2, AlertTriangle } from 'lucide-react'
import JoinModal from './JoinModal'

interface JoinNodeData {
  join: {
    id: number
    name: string
    leftTable: string
    rightTable: string
    leftTableId: number
    rightTableId: number
    leftTableType: string
    rightTableType: string
    joinType: string
    joinKeys: { left: string; right: string }[]
    status: 'pending' | 'completed' | 'failed' | 'running'
    outputTableName?: string
    errorMessage?: string
  }
  onViewData?: (joinId: number, joinName: string) => void
  onEdit?: (joinId: number) => void
  onDelete?: (joinId: number) => void
  onExecute?: (joinId: number) => void
  onUpdateJoin?: (joinId: number, joinConfig: {
    name: string
    outputTableName?: string
    leftTable: number
    rightTable: number
    joinType: 'inner' | 'left' | 'right' | 'full'
    joinKeys: { left: string; right: string }[]
  }) => Promise<void>
  availableTables?: Array<{
    id: number
    name: string
    columns: string[]
  }>
}

interface JoinNodeProps {
  data: JoinNodeData
  selected: boolean
}

export default function JoinNode({ data, selected }: JoinNodeProps) {
  const { join, onViewData, onEdit, onDelete, onExecute, onUpdateJoin, availableTables } = data
  const [showEditModal, setShowEditModal] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500'
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
      case 'pending': return 'Run pending'
      case 'running': return 'Running'
      case 'completed': return 'Completed'
      case 'failed': return 'Failed'
      default: return 'Run pending'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <Sparkles className="text-white" size={14} />
      case 'failed':
        return <span className="text-white text-xs font-bold">!</span>
      case 'running':
        return <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
      case 'pending':
      default:
        return <Link className="text-white" size={14} />
    }
  }

  const handleUpdateJoin = async (joinConfig: {
    name: string
    outputTableName?: string
    leftTable: number
    rightTable: number
    joinType: 'inner' | 'left' | 'right' | 'full'
    joinKeys: { left: string; right: string }[]
  }) => {
    if (onUpdateJoin) {
      await onUpdateJoin(join.id, joinConfig)
    }
    setShowEditModal(false)
  }

  const handleExecute = async () => {
    if (!onExecute || isExecuting) return
    
    setIsExecuting(true)
    try {
      await onExecute(join.id)
    } finally {
      setIsExecuting(false)
    }
  }

  return (
    <>
      <div className={`bg-white border-2 rounded-lg shadow-lg min-w-[320px] hover:shadow-xl transition-shadow relative ${
        selected ? 'ring-2 ring-purple-300 shadow-xl' : ''
      }`}>
      <NodeResizer 
        minWidth={320} 
        minHeight={200}
        handleStyle={{
          width: '12px',
          height: '12px',
          borderRadius: '2px',
          backgroundColor: '#8B5CF6',
          border: '2px solid white',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}
        lineStyle={{
          borderColor: '#8B5CF6',
          borderWidth: '2px'
        }}
      />
      
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        id={`join-${join.id}-input`}
        style={{
          background: '#8B5CF6',
          width: 12,
          height: 12,
          border: '2px solid white',
        }}
      />

      {/* Header */}
      <div className={`px-4 py-3 rounded-t-lg flex items-center gap-3 ${getStatusColor(join.status)}`}>
        <div className="bg-white/20 p-1 rounded">
          {getStatusIcon(join.status)}
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-sm truncate text-white" title={join.name}>
            {join.name}
          </h3>
          <div className="text-xs opacity-75 text-white">
            {getStatusDisplayText(join.status)} • {join.joinType.toUpperCase()} JOIN
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 bg-white">
        <div className="space-y-3">
          {/* Join Details */}
          <div>
            <div className="text-xs font-medium text-gray-700 mb-1">Join Configuration:</div>
            <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded space-y-1">
              <div><strong>Left:</strong> {join.leftTable}</div>
              <div><strong>Right:</strong> {join.rightTable}</div>
              <div><strong>Type:</strong> {join.joinType.toUpperCase()}</div>
            </div>
          </div>

          {/* Join Keys */}
          {join.joinKeys.length > 0 && (
            <div>
              <div className="text-xs font-medium text-gray-700 mb-1">Join Conditions:</div>
              <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                {join.joinKeys.map((key, index) => (
                  <div key={index}>{key.left} = {key.right}</div>
                ))}
              </div>
            </div>
          )}

          {/* Output Table Name */}
          {join.outputTableName && join.status === 'completed' && (
            <div>
              <div className="text-xs font-medium text-gray-700 mb-1">Output Table:</div>
              <div 
                className={`text-sm bg-green-50 border border-green-200 p-2 rounded font-mono ${
                  onViewData && join.status === 'completed' && !join.errorMessage
                    ? 'cursor-pointer hover:bg-green-100 transition-colors'
                    : ''
                }`}
                onClick={onViewData && join.status === 'completed' && !join.errorMessage ? () => onViewData(join.id, join.name) : undefined}
                title={onViewData && join.status === 'completed' && !join.errorMessage ? 'Click to view data' : undefined}
              >
                📊 {join.outputTableName}
              </div>
            </div>
          )}

          {/* Error Message */}
          {join.status === 'failed' && join.errorMessage && (
            <div>
              <div className="text-xs font-medium text-red-700 mb-1 flex items-center gap-1">
                <AlertTriangle size={12} />
                Error Message:
              </div>
              <div className="text-sm bg-red-50 border border-red-200 p-2 rounded text-red-800">
                {join.errorMessage}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowEditModal(true)}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
              title="Edit join"
            >
              <Edit3 size={14} />
            </button>
            {onViewData && (
              <button
                onClick={join.status === 'completed' && !join.errorMessage ? () => onViewData(join.id, join.name) : undefined}
                className={`p-2 rounded transition-colors ${
                  join.status === 'completed' && !join.errorMessage
                    ? 'text-blue-500 hover:text-blue-700 hover:bg-blue-50' 
                    : 'text-gray-400 cursor-not-allowed'
                }`}
                title={
                  join.status === 'completed' && !join.errorMessage
                    ? "View output data" 
                    : join.errorMessage 
                      ? "Cannot view data - join has errors" 
                      : "Run the node to see the results"
                }
                disabled={join.status !== 'completed' || !!join.errorMessage}
              >
                <Table size={14} />
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete(join.id)}
                className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                title="Delete join"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
          
          {/* Execute Button - Only show when not running */}
          <div className="flex items-center gap-1">
            {onExecute && (join.status as any) !== 'running' && !isExecuting && (
              <button
                onClick={handleExecute}
                disabled={(join.status as any) === 'running' || isExecuting}
                className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  (join.status as any) === 'running' || isExecuting
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
                title="Execute join"
              >
                <Play size={12} />
                Execute
              </button>
            )}
            {isExecuting && (
              <button
                disabled
                className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium bg-gray-300 text-gray-500 cursor-not-allowed"
                title="Executing join..."
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
        position={Position.Bottom}
        id={`join-${join.id}-output`}
        style={{
          background: '#8B5CF6',
          width: 12,
          height: 12,
          border: '2px solid white',
        }}
      />
      </div>

      {/* Edit Modal */}
      {showEditModal && availableTables && createPortal(
        <JoinModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          onCreateJoin={handleUpdateJoin}
          position={{ x: 200, y: 200 }}
          availableTables={availableTables}
          initialJoin={{
            id: join.id,
            name: join.name,
            outputTableName: join.outputTableName,
            leftTable: join.leftTable,
            rightTable: join.rightTable,
            leftTableId: join.leftTableId,
            rightTableId: join.rightTableId,
            leftTableType: join.leftTableType,
            rightTableType: join.rightTableType,
            joinType: join.joinType as 'inner' | 'left' | 'right' | 'full',
            joinKeys: join.joinKeys
          }}
        />,
        document.body
      )}
    </>
  )
}