'use client'

import React, { useState, useEffect, useRef } from 'react'
import { X, Database, Link, AlertTriangle, Loader2 } from 'lucide-react'

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
    outputTableName?: string
    leftTable: number
    rightTable: number
    joinType: 'inner' | 'left' | 'right' | 'full'
    joinKeys: { left: string; right: string }[]
  }) => void
  position: { x: number; y: number }
  availableTables: Table[]
  initialJoin?: {
    id: number
    name: string
    outputTableName?: string
    leftTable: string
    rightTable: string
    leftTableId: number
    rightTableId: number
    leftTableType: string
    rightTableType: string
    joinType: 'inner' | 'left' | 'right' | 'full'
    joinKeys: { left: string; right: string }[]
  }
}

export default function JoinModal({ 
  isOpen, 
  onClose, 
  onCreateJoin, 
  position, 
  availableTables,
  initialJoin 
}: JoinModalProps) {
  const [joinName, setJoinName] = useState('')
  const [outputTableName, setOutputTableName] = useState('')
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

  // Warning dialog state
  const [showWarning, setShowWarning] = useState(false)
  const [warningMessage, setWarningMessage] = useState('')
  const [pendingSubmit, setPendingSubmit] = useState(false)
  
  // Loading states
  const [isValidating, setIsValidating] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  const leftTableData = availableTables.find(t => t.id === leftTable)
  const rightTableData = availableTables.find(t => t.id === rightTable)

  // Initialize form fields when editing
  useEffect(() => {
    if (initialJoin) {
      setJoinName(initialJoin.name)
      setOutputTableName(initialJoin.outputTableName || '')
      setJoinType(initialJoin.joinType)
      setJoinKeys(initialJoin.joinKeys)
      
      // Convert backend table IDs to frontend availableTables IDs (with offsets)
      let leftTableId: number | null = null
      let rightTableId: number | null = null
      
      if (initialJoin.leftTableType === 'sheet') {
        leftTableId = initialJoin.leftTableId
      } else if (initialJoin.leftTableType === 'transformation') {
        leftTableId = initialJoin.leftTableId + 10000 // Offset for transformation tables
      }
      
      if (initialJoin.rightTableType === 'sheet') {
        rightTableId = initialJoin.rightTableId
      } else if (initialJoin.rightTableType === 'transformation') {
        rightTableId = initialJoin.rightTableId + 10000 // Offset for transformation tables
      }
      
      if (leftTableId) setLeftTable(leftTableId)
      if (rightTableId) setRightTable(rightTableId)
    } else {
      // Reset form for new join
      setJoinName('')
      setOutputTableName('')
      setLeftTable(null)
      setRightTable(null)
      setJoinType('inner')
      setJoinKeys([{ left: '', right: '' }])
    }
  }, [initialJoin, availableTables])

  useEffect(() => {
    if (isOpen) {
      // Only reset form when modal opens for NEW join (not editing)
      if (!initialJoin) {
        setJoinName('')
        setOutputTableName('')
        setLeftTable(null)
        setRightTable(null)
        setJoinType('inner')
        setJoinKeys([{ left: '', right: '' }])
      }
      
      // Reset warning states
      setShowWarning(false)
      setPendingSubmit(false)
      setWarningMessage('')
      
      // Reset loading states
      setIsValidating(false)
      setIsCreating(false)
      
      // Center the modal on screen
      const centerX = window.innerWidth / 2 - 300 // 300 is half of modal width (600px)
      const centerY = window.innerHeight / 2 - 200 // 200 is approximate half of modal height
      setModalPosition({ x: Math.max(20, centerX), y: Math.max(20, centerY) })
    }
  }, [isOpen, initialJoin])

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

  const validateJoinColumns = async (joinConfig: {
    leftTable: number
    rightTable: number
    joinKeys: { left: string; right: string }[]
  }) => {
    try {
      // Try to fetch actual data from the backend to check for common values
      const response = await fetch(`http://localhost:8005/validate-join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          leftTableId: joinConfig.leftTable,
          rightTableId: joinConfig.rightTable,
          joinKeys: joinConfig.joinKeys
        })
      })

      if (response.ok) {
        const result = await response.json()
        return result
      } else {
        // If API doesn't exist, get actual table data and check ourselves
        return await checkActualDataValues(joinConfig)
      }
    } catch (error) {
      console.log('API not available, checking actual data values:', error)
      return await checkActualDataValues(joinConfig)
    }
  }

  const checkActualDataValues = async (joinConfig: {
    leftTable: number
    rightTable: number
    joinKeys: { left: string; right: string }[]
  }) => {
    try {
      console.log('Fetching actual data for validation:', joinConfig)
      
      // Fetch data from both tables
      const [leftResponse, rightResponse] = await Promise.all([
        fetch(`http://localhost:8005/sheets/${joinConfig.leftTable}/data`),
        fetch(`http://localhost:8005/sheets/${joinConfig.rightTable}/data`)
      ])

      if (!leftResponse.ok || !rightResponse.ok) {
        console.log('Could not fetch data from one or both tables')
        return { hasCommonValues: true, issues: [] } // Default to allowing join if we can't check
      }

      const leftData = await leftResponse.json()
      const rightData = await rightResponse.json()

      const issues: string[] = []
      let hasCommonValues = true

      // Check each join key for common values
      for (const joinKey of joinConfig.joinKeys) {
        const leftColumnData = leftData.data || []
        const rightColumnData = rightData.data || []

        // Find column indices
        const leftColumns = leftData.columns || []
        const rightColumns = rightData.columns || []
        
        const leftColIndex = leftColumns.indexOf(joinKey.left)
        const rightColIndex = rightColumns.indexOf(joinKey.right)

        if (leftColIndex === -1) {
          issues.push(`Column '${joinKey.left}' not found in left table`)
          hasCommonValues = false
          continue
        }

        if (rightColIndex === -1) {
          issues.push(`Column '${joinKey.right}' not found in right table`)
          hasCommonValues = false
          continue
        }

        // Extract values from both columns
        const leftValues = new Set(
          leftColumnData
            .map((row: any) => row[leftColIndex])
            .filter((val: any) => val !== null && val !== undefined && val !== '')
            .map((val: any) => String(val).trim().toLowerCase())
        )

        const rightValues = new Set(
          rightColumnData
            .map((row: any) => row[rightColIndex])
            .filter((val: any) => val !== null && val !== undefined && val !== '')
            .map((val: any) => String(val).trim().toLowerCase())
        )

        // Check for common values
        const commonValues = [...Array.from(leftValues)].filter(val => rightValues.has(val))
        
        console.log(`Checking join: ${joinKey.left} (${leftValues.size} unique values) vs ${joinKey.right} (${rightValues.size} unique values)`)
        console.log(`Common values found: ${commonValues.length}`, commonValues.slice(0, 5))

        if (commonValues.length === 0) {
          issues.push(`No matching values found between '${joinKey.left}' and '${joinKey.right}'. This join may return empty results.`)
          hasCommonValues = false
        } else if (commonValues.length < Math.min(leftValues.size, rightValues.size) * 0.1) {
          // Less than 10% overlap might be suspicious
          issues.push(`Very few matching values found between '${joinKey.left}' and '${joinKey.right}' (${commonValues.length} matches). Please verify this is the correct join condition.`)
          hasCommonValues = false
        }
      }

      console.log('Data validation result:', { hasCommonValues, issues })
      return { hasCommonValues, issues }
      
    } catch (error) {
      console.log('Error checking actual data values:', error)
      // If we can't check, allow the join (don't block legitimate joins due to technical issues)
      return { hasCommonValues: true, issues: [] }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Prevent multiple submissions
    if (isValidating || isCreating) {
      return
    }
    
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

    const joinConfig = {
      name: joinName,
      outputTableName: outputTableName.trim() || undefined,
      leftTable,
      rightTable,
      joinType,
      joinKeys: validJoinKeys
    }

    // If this is a forced submit (user clicked "Create Anyway"), skip validation
    if (pendingSubmit) {
      console.log('Skipping validation - forced submit')
      setIsCreating(true)
      try {
        await onCreateJoin(joinConfig)
        onClose()
      } finally {
        setIsCreating(false)
      }
      return
    }

    // Validate join columns for common values
    console.log('Starting join validation for:', { leftTable, rightTable, joinKeys: validJoinKeys })
    setIsValidating(true)
    try {
      const validation = await validateJoinColumns({
        leftTable,
        rightTable,
        joinKeys: validJoinKeys
      })

      console.log('Validation completed:', validation)

      if (!validation.hasCommonValues && validation.issues.length > 0) {
        // Show warning dialog
        console.log('Showing warning dialog with issues:', validation.issues)
        setWarningMessage(validation.issues.join('. '))
        setShowWarning(true)
        return
      } else {
        console.log('No validation issues found, proceeding with join creation')
      }
    } catch (error) {
      console.log('Validation error, proceeding anyway:', error)
    } finally {
      setIsValidating(false)
    }

    // If validation passes or fails silently, create the join
    setIsCreating(true)
    try {
      await onCreateJoin(joinConfig)
      onClose()
    } finally {
      setIsCreating(false)
    }
  }

  const handleCreateAnyway = () => {
    setPendingSubmit(true)
    setShowWarning(false)
    // Trigger submit again but skip validation
    const form = document.querySelector('form')
    if (form) {
      form.requestSubmit()
    }
  }

  const handleCancelWarning = () => {
    setShowWarning(false)
    setPendingSubmit(false)
    setWarningMessage('')
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
            <h2 className="text-xl font-semibold text-gray-900">
              {initialJoin ? 'Edit Join' : 'Create Join'}
            </h2>
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

          {/* Output Table Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Output Table Name
            </label>
            <input
              type="text"
              value={outputTableName}
              onChange={(e) => setOutputTableName(e.target.value)}
              placeholder="e.g., joined_sales_customers (optional)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              If not specified, a table name will be auto-generated
            </p>
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
              disabled={isValidating || isCreating}
              className="px-6 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center gap-2"
            >
              {(isValidating || isCreating) && <Loader2 size={16} className="animate-spin" />}
              {isValidating ? 'Validating...' : isCreating ? 'Creating...' : (initialJoin ? 'Save Changes' : 'Create Join')}
            </button>
          </div>
        </form>
      </div>

      {/* Warning Dialog Overlay */}
      {showWarning && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-yellow-100 p-2 rounded-full">
                  <AlertTriangle className="text-yellow-600" size={24} />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Join Validation Warning</h3>
              </div>
              
              <div className="mb-6">
                <p className="text-gray-700 mb-3">
                  We detected potential issues with your join configuration:
                </p>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <p className="text-sm text-yellow-800">{warningMessage}</p>
                </div>
                <p className="text-sm text-gray-600 mt-3">
                  This might result in an empty result set or unexpected join behavior. 
                  Do you want to create the join anyway?
                </p>
              </div>
              
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={handleCancelWarning}
                  className="px-4 py-2 text-gray-600 hover:text-gray-700 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateAnyway}
                  disabled={isCreating}
                  className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center gap-2"
                >
                  {isCreating && <Loader2 size={16} className="animate-spin" />}
                  {isCreating ? 'Creating...' : 'Create Anyway'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}