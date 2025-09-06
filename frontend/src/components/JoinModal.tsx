'use client'

import React, { useState, useEffect, useRef } from 'react'
import { X, Database, Link } from 'lucide-react'

interface Table {
  id: number
  name: string
  columns: string[]
}

interface JoinModalProps {
  isOpen: boolean
  onClose: () => void
  onCreateJoin: (joinConfig: {
    name: string
    leftTable: number
    rightTable: number
    joinType: 'inner' | 'left' | 'right' | 'full'
    joinKeys: { left: string; right: string }[]
  }) => void
  position: { x: number; y: number }
  availableTables: Table[]
}

export default function JoinModal({ 
  isOpen, 
  onClose, 
  onCreateJoin, 
  position, 
  availableTables 
}: JoinModalProps) {
  const [joinName, setJoinName] = useState('')
  const [leftTable, setLeftTable] = useState<number | null>(null)
  const [rightTable, setRightTable] = useState<number | null>(null)
  const [joinType, setJoinType] = useState<'inner' | 'left' | 'right' | 'full'>('inner')
  const [joinKeys, setJoinKeys] = useState<{ left: string; right: string }[]>([
    { left: '', right: '' }
  ])

  // Dragging state
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [modalPosition, setModalPosition] = useState({ x: 0, y: 0 })
  const modalRef = useRef<HTMLDivElement>(null)

  const leftTableData = availableTables.find(t => t.id === leftTable)
  const rightTableData = availableTables.find(t => t.id === rightTable)

  useEffect(() => {
    if (isOpen) {
      // Reset form when modal opens
      setJoinName('')
      setLeftTable(null)
      setRightTable(null)
      setJoinType('inner')
      setJoinKeys([{ left: '', right: '' }])
      
      // Center the modal on screen
      const centerX = window.innerWidth / 2 - 300 // 300 is half of modal width (600px)
      const centerY = window.innerHeight / 2 - 200 // 200 is approximate half of modal height
      setModalPosition({ x: Math.max(20, centerX), y: Math.max(20, centerY) })
    }
  }, [isOpen])

  // Drag functionality
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    const rect = modalRef.current?.getBoundingClientRect()
    if (rect) {
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      })
    }
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const newX = Math.max(0, Math.min(window.innerWidth - 600, e.clientX - dragOffset.x))
        const newY = Math.max(0, Math.min(window.innerHeight - 100, e.clientY - dragOffset.y))
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

  const addJoinKey = () => {
    setJoinKeys([...joinKeys, { left: '', right: '' }])
  }

  const removeJoinKey = (index: number) => {
    if (joinKeys.length > 1) {
      setJoinKeys(joinKeys.filter((_, i) => i !== index))
    }
  }

  const updateJoinKey = (index: number, side: 'left' | 'right', value: string) => {
    const updated = [...joinKeys]
    updated[index][side] = value
    setJoinKeys(updated)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!joinName || !leftTable || !rightTable) {
      alert('Please fill in all required fields')
      return
    }

    if (leftTable === rightTable) {
      alert('Please select different tables for left and right sides')
      return
    }

    const validJoinKeys = joinKeys.filter(jk => jk.left && jk.right)
    if (validJoinKeys.length === 0) {
      alert('Please specify at least one join condition')
      return
    }

    onCreateJoin({
      name: joinName,
      leftTable,
      rightTable,
      joinType,
      joinKeys: validJoinKeys
    })

    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div 
        ref={modalRef}
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto absolute"
        style={{
          left: modalPosition.x,
          top: modalPosition.y,
          width: '600px',
          cursor: isDragging ? 'grabbing' : 'default'
        }}
      >
        {/* Header */}
        <div 
          className="flex items-center justify-between p-6 border-b border-gray-200 cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center gap-3">
            <div className="bg-purple-100 rounded-full p-2">
              <Link className="text-purple-600" size={20} />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">Create Join</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Join Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Join Name *
            </label>
            <input
              type="text"
              value={joinName}
              onChange={(e) => setJoinName(e.target.value)}
              placeholder="e.g., Sales and Customers Join"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              required
            />
          </div>

          {/* Table Selection */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Left Table *
              </label>
              <select
                value={leftTable || ''}
                onChange={(e) => setLeftTable(Number(e.target.value) || null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                required
              >
                <option value="">Select left table</option>
                {availableTables.map(table => (
                  <option key={table.id} value={table.id}>
                    {table.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Right Table *
              </label>
              <select
                value={rightTable || ''}
                onChange={(e) => setRightTable(Number(e.target.value) || null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                required
              >
                <option value="">Select right table</option>
                {availableTables.map(table => (
                  <option key={table.id} value={table.id}>
                    {table.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Join Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Join Type *
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                { value: 'inner', label: 'Inner Join', desc: 'Only matching rows' },
                { value: 'left', label: 'Left Join', desc: 'All left + matching' },
                { value: 'right', label: 'Right Join', desc: 'All right + matching' },
                { value: 'full', label: 'Full Join', desc: 'All rows from both' }
              ].map(type => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setJoinType(type.value as any)}
                  className={`p-3 rounded-lg border-2 text-center transition-colors ${
                    joinType === type.value
                      ? 'border-purple-500 bg-purple-50 text-purple-700'
                      : 'border-gray-200 hover:border-gray-300 text-gray-600'
                  }`}
                >
                  <div className="font-medium text-sm">{type.label}</div>
                  <div className="text-xs mt-1">{type.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Join Conditions */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-gray-700">
                Join Conditions *
              </label>
              <button
                type="button"
                onClick={addJoinKey}
                className="text-sm text-purple-600 hover:text-purple-700 font-medium"
              >
                + Add Condition
              </button>
            </div>

            <div className="space-y-3">
              {joinKeys.map((joinKey, index) => (
                <div key={index} className="flex items-center gap-3">
                  <select
                    value={joinKey.left}
                    onChange={(e) => updateJoinKey(index, 'left', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    disabled={!leftTableData}
                  >
                    <option value="">Select left column</option>
                    {leftTableData?.columns.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>

                  <div className="text-gray-500 font-mono">=</div>

                  <select
                    value={joinKey.right}
                    onChange={(e) => updateJoinKey(index, 'right', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    disabled={!rightTableData}
                  >
                    <option value="">Select right column</option>
                    {rightTableData?.columns.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>

                  {joinKeys.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeJoinKey(index)}
                      className="text-red-600 hover:text-red-700 p-1"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:text-gray-700 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors"
            >
              Create Join
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}