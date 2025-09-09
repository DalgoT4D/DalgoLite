'use client'

import React from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { Sheet, Database, Users, Table } from 'lucide-react'

interface SheetData {
  sheet: {
    id: number
    title: string
    columns: string[]
    total_rows: number
  }
  onConnect?: (sheetId: number) => void
  onViewData?: (sheetId: number, sheetName: string) => void
}

export default function SheetNode({ data }: NodeProps<SheetData>) {
  const { sheet, onConnect, onViewData } = data

  return (
    <div className="bg-white border-2 border-blue-300 rounded-lg shadow-lg min-w-[250px] hover:shadow-xl transition-shadow">
      {/* Header */}
      <div className="bg-blue-600 text-white px-4 py-3 rounded-t-lg flex items-center gap-3">
        <div className="bg-white/20 p-1 rounded">
          <Sheet size={18} />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-sm truncate" title={sheet.title}>
            {sheet.title}
          </h3>
          <div className="text-blue-100 text-xs">Google Sheet</div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="space-y-3">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 text-gray-600">
              <Users size={14} />
              <span>{sheet.total_rows.toLocaleString()} rows</span>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <Database size={14} />
              <span>{sheet.columns.length} columns</span>
            </div>
          </div>

          {/* Columns Preview */}
          <div>
            <div className="text-xs font-medium text-gray-700 mb-2">Columns:</div>
            <div className="flex flex-wrap gap-1">
              {sheet.columns.slice(0, 4).map((column, index) => (
                <span
                  key={index}
                  className="inline-block bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded border"
                  title={column}
                >
                  {column.length > 12 ? `${column.slice(0, 12)}...` : column}
                </span>
              ))}
              {sheet.columns.length > 4 && (
                <span className="inline-block bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">
                  +{sheet.columns.length - 4}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        {onViewData && (
          <div className="mt-3">
            <button
              onClick={() => onViewData(sheet.id, sheet.title)}
              className="w-full flex items-center justify-center gap-2 py-2 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors border border-blue-200"
              title="View sheet data"
            >
              <Table size={14} />
              View Data
            </button>
          </div>
        )}
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        id={`sheet-${sheet.id}-output`}
        style={{
          background: '#3B82F6',
          width: 12,
          height: 12,
          border: '2px solid white',
        }}
      />
      
      {/* Hover tooltip for connection */}
      <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        Drag from the blue dot to connect
      </div>
    </div>
  )
}