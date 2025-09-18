'use client'

import React from 'react'
import { ChevronDown, Table, Database, Zap, Link, MessageSquare } from 'lucide-react'

interface Table {
  id: number
  name: string
  columns: string[]
  type: 'sheet' | 'transformation' | 'join' | 'qualitative'
}

interface DataSourceDropdownProps {
  availableTables: Table[]
  selectedTableIds: number[]
  onSelectionChange: (tableIds: number[]) => void
  multiple?: boolean
  placeholder?: string
  label?: string
  required?: boolean
  className?: string
}

export default function DataSourceDropdown({
  availableTables,
  selectedTableIds,
  onSelectionChange,
  multiple = false,
  placeholder = "Select data source...",
  label = "Data Source",
  required = false,
  className = ""
}: DataSourceDropdownProps) {
  const [isOpen, setIsOpen] = React.useState(false)

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'sheet': return <Table size={16} className="text-blue-600" />
      case 'transformation': return <Zap size={16} className="text-green-600" />
      case 'join': return <Link size={16} className="text-purple-600" />
      case 'qualitative': return <MessageSquare size={16} className="text-orange-600" />
      default: return <Database size={16} className="text-gray-600" />
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'sheet': return 'bg-blue-600'
      case 'transformation': return 'bg-green-600'
      case 'join': return 'bg-purple-600'
      case 'qualitative': return 'bg-orange-600'
      default: return 'bg-gray-600'
    }
  }

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'sheet': return 'Original Sheet'
      case 'transformation': return 'Transformation Output'
      case 'join': return 'Join Output'
      case 'qualitative': return 'Qualitative Analysis Output'
      default: return 'Data Source'
    }
  }

  const selectedTables = availableTables.filter(table => selectedTableIds.includes(table.id))

  const handleTableToggle = (tableId: number) => {
    if (multiple) {
      const newSelection = selectedTableIds.includes(tableId)
        ? selectedTableIds.filter(id => id !== tableId)
        : [...selectedTableIds, tableId]
      onSelectionChange(newSelection)
    } else {
      onSelectionChange(selectedTableIds.includes(tableId) ? [] : [tableId])
      setIsOpen(false)
    }
  }

  const displayText = () => {
    if (selectedTables.length === 0) return placeholder
    if (selectedTables.length === 1) return selectedTables[0].name
    return `${selectedTables.length} sources selected`
  }

  return (
    <div className={`relative ${className}`}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full px-3 py-2 text-left bg-white border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <div className="flex items-center justify-between">
            <span className={selectedTables.length === 0 ? "text-gray-500" : "text-gray-900"}>
              {displayText()}
            </span>
            <ChevronDown size={20} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </div>
        </button>

        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
            {availableTables.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">No data sources available</div>
            ) : (
              availableTables.map((table) => (
                <div
                  key={table.id}
                  onClick={() => handleTableToggle(table.id)}
                  className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer"
                >
                  {multiple && (
                    <input
                      type="checkbox"
                      checked={selectedTableIds.includes(table.id)}
                      onChange={() => {}} // Handled by onClick
                      className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                  )}
                  <div className="flex items-center gap-2 flex-1">
                    <div className={`w-3 h-3 ${getTypeColor(table.type)} rounded`}></div>
                    {getTypeIcon(table.type)}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 truncate">{table.name}</div>
                      <div className="text-sm text-gray-500">({getTypeLabel(table.type)})</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Show selected tables when multiple */}
      {multiple && selectedTables.length > 0 && (
        <div className="mt-2 space-y-1">
          {selectedTables.map((table) => (
            <div key={table.id} className="flex items-center gap-2 px-2 py-1 bg-gray-50 rounded text-sm">
              <div className={`w-2 h-2 ${getTypeColor(table.type)} rounded`}></div>
              <span className="flex-1">{table.name}</span>
              <button
                onClick={() => handleTableToggle(table.id)}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Click outside to close */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  )
}