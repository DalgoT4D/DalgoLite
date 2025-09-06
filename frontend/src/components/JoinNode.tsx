'use client'

import React from 'react'
import { Handle, Position } from 'reactflow'
import { Link, Eye, Trash2, Settings, Play } from 'lucide-react'

interface JoinNodeData {
  join: {
    id: number
    name: string
    leftTable: string
    rightTable: string
    joinType: string
    joinKeys: { left: string; right: string }[]
    status: 'pending' | 'completed' | 'failed'
  }
  onViewData?: (joinId: number, joinName: string) => void
  onEdit?: (joinId: number) => void
  onDelete?: (joinId: number) => void
  onExecute?: (joinId: number) => void
}

interface JoinNodeProps {
  data: JoinNodeData
  selected: boolean
}

export default function JoinNode({ data, selected }: JoinNodeProps) {
  const { join, onViewData, onEdit, onDelete, onExecute } = data

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'border-green-400 bg-green-50'
      case 'failed':
        return 'border-red-400 bg-red-50'
      case 'pending':
      default:
        return 'border-purple-400 bg-purple-50'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return '✓'
      case 'failed':
        return '✗'
      case 'pending':
      default:
        return '⧮'
    }
  }

  return (
    <div
      className={`min-w-64 bg-white border-2 rounded-lg shadow-md transition-all duration-200 ${
        selected ? 'shadow-lg ring-2 ring-purple-200' : ''
      } ${getStatusColor(join.status)}`}
    >
      {/* Input Handles */}
      <Handle
        type="target"
        position={Position.Left}
        id="join-left-input"
        className="w-3 h-3 bg-purple-400 border-white"
      />
      <Handle
        type="target"
        position={Position.Right}
        id="join-right-input"
        className="w-3 h-3 bg-purple-400 border-white"
      />

      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-purple-200">
        <div className="flex items-center gap-2">
          <Link className="text-purple-600" size={18} />
          <div>
            <div className="font-medium text-gray-900 text-sm">{join.name}</div>
            <div className="text-xs text-gray-500">
              {join.joinType.toUpperCase()} JOIN
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-sm">{getStatusIcon(join.status)}</span>
        </div>
      </div>

      {/* Content */}
      <div className="p-3">
        <div className="text-xs text-gray-600 space-y-1">
          <div>Left: {join.leftTable}</div>
          <div>Right: {join.rightTable}</div>
          {join.joinKeys.length > 0 && (
            <div>On: {join.joinKeys.map(k => `${k.left} = ${k.right}`).join(', ')}</div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between p-2 border-t border-purple-200 bg-purple-25">
        <div className="flex items-center gap-1">
          {join.status === 'pending' && onExecute && (
            <button
              onClick={() => onExecute(join.id)}
              className="text-green-600 hover:text-green-700 p-1 rounded transition-colors"
              title="Execute join"
            >
              <Play size={14} />
            </button>
          )}
          {join.status === 'completed' && onViewData && (
            <button
              onClick={() => onViewData(join.id, join.name)}
              className="text-blue-600 hover:text-blue-700 p-1 rounded transition-colors"
              title="View joined data"
            >
              <Eye size={14} />
            </button>
          )}
          {onEdit && (
            <button
              onClick={() => onEdit(join.id)}
              className="text-gray-600 hover:text-gray-700 p-1 rounded transition-colors"
              title="Edit join"
            >
              <Settings size={14} />
            </button>
          )}
        </div>
        {onDelete && (
          <button
            onClick={() => onDelete(join.id)}
            className="text-red-600 hover:text-red-700 p-1 rounded transition-colors"
            title="Delete join"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="join-output"
        className="w-3 h-3 bg-purple-600 border-white"
      />
    </div>
  )
}