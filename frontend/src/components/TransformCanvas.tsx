'use client'

import React, { useState, useCallback, useEffect, useMemo } from 'react'
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  Connection,
  useNodesState,
  useEdgesState,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  NodeTypes,
  EdgeTypes,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { Plus, Play, Save, Zap, X, ChevronDown, Loader2, Brain } from 'lucide-react'

import SheetNode from './SheetNode'
import TransformationNode from './TransformationNode'
import JoinNode from './JoinNode'
import QualitativeDataNode from './QualitativeDataNode'
import DataViewer from './DataViewer'
import ContextMenu from './ContextMenu'
import JoinModal from './JoinModal'
import QualitativeDataModal from './QualitativeDataModal'
import { getApiUrl, API_ENDPOINTS } from '@/lib/config'

// Type definitions
interface QualitativeDataOperation {
  id: number
  name: string
  source_table_id: number
  source_table_type: string
  qualitative_column: string
  analysis_type: string
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

// Define custom node types
const nodeTypes: NodeTypes = {
  sheetNode: SheetNode,
  transformationNode: TransformationNode,
  joinNode: JoinNode,
  qualitativeDataNode: QualitativeDataNode,
}

interface TransformCanvasProps {
  projectId: number
  sheets: Array<{
    id: number
    title: string
    columns: string[]
    total_rows: number
  }>
  transformationSteps: Array<{
    id: number
    step_name: string
    user_prompt: string
    generated_code?: string
    code_summary: string
    code_explanation?: string
    output_table_name?: string
    status: string
    error_message?: string
    execution_time_ms?: number
    output_columns?: string[]
    canvas_position: { x: number; y: number }
  }>
  joins: Array<any>
  qualitativeDataOperations?: Array<{
    id: number
    name: string
    source_table_id: number
    source_table_type: string
    qualitative_column: string
    analysis_type: string
    status: 'pending' | 'running' | 'completed' | 'failed'
    error_message?: string
    output_table_name?: string
    total_records_processed?: number
    batch_count?: number
    execution_time_ms?: number
    canvas_position: { x: number; y: number }
  }>
  onCreateTransformationStep: (stepData: {
    step_name: string
    user_prompt: string
    output_table_name?: string
    upstream_sheet_ids: number[]
    upstream_step_ids: number[]
    canvas_position: { x: number; y: number }
  }) => Promise<void>
  onUpdateTransformationStep: (stepId: number, updates: any) => Promise<void>
  onExecuteStep: (stepId: number) => Promise<void>
  onExecuteAll?: () => Promise<void>
  onDeleteTransformationStep?: (stepId: number) => Promise<void>
  onJoinCreated?: () => Promise<void>
  onQualitativeDataCreated?: () => Promise<void>
}

export default function TransformCanvas({
  projectId,
  sheets,
  transformationSteps,
  joins,
  qualitativeDataOperations = [],
  onCreateTransformationStep,
  onUpdateTransformationStep,
  onExecuteStep,
  onExecuteAll,
  onDeleteTransformationStep,
  onJoinCreated,
  onQualitativeDataCreated,
}: TransformCanvasProps) {
  const [nodes, setNodes, onNodesChangeOriginal] = useNodesState([])
  const [edges, setEdges, onEdgesChangeOriginal] = useEdgesState([])
  
  // Wrap the original handlers to detect changes
  const onNodesChange = useCallback((changes: any) => {
    onNodesChangeOriginal(changes)
    // Check if this is a position change (drag)
    const hasPositionChange = changes.some((change: any) => change.type === 'position')
    if (hasPositionChange) {
      setHasUnsavedChanges(true)
    }
  }, [onNodesChangeOriginal])
  
  const onEdgesChange = useCallback((changes: any) => {
    onEdgesChangeOriginal(changes)
    setHasUnsavedChanges(true)
  }, [onEdgesChangeOriginal])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createModalPosition, setCreateModalPosition] = useState({ x: 0, y: 0 })
  const [newStepName, setNewStepName] = useState('')
  const [newStepPrompt, setNewStepPrompt] = useState('')
  const [newOutputTableName, setNewOutputTableName] = useState('')
  const [selectedUpstreamNodes, setSelectedUpstreamNodes] = useState<string[]>([])
  const [isExecutingAll, setIsExecutingAll] = useState(false)
  const [isCreatingStep, setIsCreatingStep] = useState(false)
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  
  // Join modal state
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [joinModalPosition, setJoinModalPosition] = useState({ x: 0, y: 0 })
  
  // Qualitative Data modal state
  const [showQualitativeModal, setShowQualitativeModal] = useState(false)
  const [qualitativeModalPosition, setQualitativeModalPosition] = useState({ x: 0, y: 0 })
  const [editingQualitativeOperation, setEditingQualitativeOperation] = useState<QualitativeDataOperation | null>(null)
  
  // AI Transformation modal drag state
  const [isTransformModalDragging, setIsTransformModalDragging] = useState(false)
  const [transformModalDragOffset, setTransformModalDragOffset] = useState({ x: 0, y: 0 })
  const [transformModalPosition, setTransformModalPosition] = useState({ x: 0, y: 0 })
  
  // Data viewer state
  const [dataViewerOpen, setDataViewerOpen] = useState(false)
  const [dataViewerSource, setDataViewerSource] = useState<{
    id: string
    type: 'sheet' | 'transformation' | 'project'
    name: string
    transformationStep?: string
  } | null>(null)
  
  // Dropdown state
  const [showCreateDropdown, setShowCreateDropdown] = useState(false)
  
  // Auto-save state
  const [lastAutoSave, setLastAutoSave] = useState<Date>(new Date())
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

  // Save canvas layout function
  const saveCanvasLayout = useCallback(async (isManual = false) => {
    if (isManual) {
      setIsSaving(true)
    }
    try {
      const nodeData = nodes.map(node => ({
        id: node.id,
        type: node.type,
        position: node.position,
        width: node.width,
        height: node.height,
        style: node.style,
        data: {
          // Only save essential data, not functions
          ...(node.type === 'sheetNode' ? { sheet: node.data.sheet } : {}),
          ...(node.type === 'transformationNode' ? { 
            step: {
              id: node.data.step.id,
              step_name: node.data.step.step_name,
              status: node.data.step.status,
              canvas_position: node.position
            }
          } : {})
        }
      }))

      const connectionData = edges.map(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle
      }))

      const response = await fetch(getApiUrl(`/projects/${projectId}/canvas-layout`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nodes: nodeData,
          connections: connectionData
        }),
      })

      if (response.ok) {
        setLastAutoSave(new Date())
        setHasUnsavedChanges(false)
        if (isManual) {
          setLastSaved(new Date())
        }
        (isManual ? 'Canvas layout saved successfully' : 'Canvas layout auto-saved successfully')
      } else {
        console.error('Failed to save canvas layout')
      }
    } catch (error) {
      console.error('Error saving canvas layout:', error)
    } finally {
      if (isManual) {
        setIsSaving(false)
      }
    }
  }, [nodes, edges, projectId])

  // Manual save handler
  const handleManualSave = useCallback(() => {
    saveCanvasLayout(true)
  }, [saveCanvasLayout])

  // Auto-save interval (every 10 seconds)
  useEffect(() => {
    if (hasUnsavedChanges) {
      const autoSaveInterval = setInterval(() => {
        saveCanvasLayout()
      }, 10000) // 10 seconds

      return () => clearInterval(autoSaveInterval)
    }
  }, [hasUnsavedChanges, saveCanvasLayout])

  // Auto-save on edge changes (connections)
  useEffect(() => {
    if (hasUnsavedChanges) {
      const saveTimeout = setTimeout(() => {
        saveCanvasLayout()
      }, 100)
      return () => clearTimeout(saveTimeout)
    }
  }, [edges, hasUnsavedChanges, saveCanvasLayout])


  // Initialize nodes from sheets and transformation steps
  useEffect(() => {
    const initializeCanvas = async () => {
      // Load canvas layout inline to avoid dependency issues
      let savedLayout = null
      try {
        const response = await fetch(getApiUrl(`/projects/${projectId}`))
        if (response.ok) {
          const project = await response.json()
          if (project.canvas_layout) {
            savedLayout = project.canvas_layout
            // Load saved connections
            if (project.canvas_layout.connections) {
              const savedEdges = project.canvas_layout.connections.map((conn: any) => ({
                id: conn.id,
                source: conn.source,
                target: conn.target,
                sourceHandle: conn.sourceHandle,
                targetHandle: conn.targetHandle
              }))
              setEdges(savedEdges)
            }
          } else {
          }
        } else {
        }
      } catch (error) {
        console.error('Error loading canvas layout:', error)
      }
      
      const initialNodes: Node[] = []
    
      // Add sheet nodes
      sheets.forEach((sheet, index) => {
        // Check if there's a saved position for this sheet
        const savedNode = savedLayout?.nodes?.find((n: any) => n.id === `sheet-${sheet.id}`)
        const position = savedNode?.position || { x: 50, y: 50 + index * 150 }
        
        initialNodes.push({
          id: `sheet-${sheet.id}`,
          type: 'sheetNode',
          position,
          data: {
            sheet,
            onConnect: (sheetId: number) => {
              // Handle connection from sheet
            },
            onViewData: handleViewSheetData
          },
        })
      })

      // Add transformation step nodes
      transformationSteps.forEach((step) => {
        // Check if there's a saved position for this step
        const savedNode = savedLayout?.nodes?.find((n: any) => n.id === `step-${step.id}`)
        const position = savedNode?.position || step.canvas_position || { x: 400, y: 200 }
        
        const nodeConfig: any = {
          id: `step-${step.id}`,
          type: 'transformationNode',
          position,
          data: {
            step,
            onUpdate: (stepId: number, updates: any) => onUpdateTransformationStep(stepId, updates),
            onExecute: (stepId: number) => onExecuteStep(stepId),
            onViewData: handleViewTransformationData,
            onDelete: onDeleteTransformationStep ? handleDeleteTransformationStep : undefined
          }
        }
        
        // Restore saved dimensions if available
        if (savedNode?.width) nodeConfig.width = savedNode.width
        if (savedNode?.height) nodeConfig.height = savedNode.height
        if (savedNode?.style) nodeConfig.style = savedNode.style
        
        initialNodes.push(nodeConfig)
      })

      // Add join nodes
      try {
        const joinsResponse = await fetch(getApiUrl(`/projects/${projectId}/joins`))
        if (joinsResponse.ok) {
          const joinsData = await joinsResponse.json()
          
          joinsData.joins.forEach((join: any) => {
            const savedNode = savedLayout?.nodes?.find((n: any) => n.id === `join-${join.id}`)
            const position = savedNode?.position || join.canvas_position || { x: 300, y: 350 }
            
            // Resolve table names from IDs
            const leftTableName = join.left_table_type === 'sheet' 
              ? sheets.find(s => s.id === join.left_table_id)?.title || 'Unknown'
              : transformationSteps.find(t => t.id === join.left_table_id)?.step_name || 'Unknown'
            
            const rightTableName = join.right_table_type === 'sheet' 
              ? sheets.find(s => s.id === join.right_table_id)?.title || 'Unknown'
              : transformationSteps.find(t => t.id === join.right_table_id)?.step_name || 'Unknown'
            
            initialNodes.push({
              id: `join-${join.id}`,
              type: 'joinNode',
              position,
              data: {
                join: {
                  id: join.id,
                  name: join.name,
                  leftTable: leftTableName,
                  rightTable: rightTableName,
                  leftTableId: join.left_table_id,
                  rightTableId: join.right_table_id,
                  leftTableType: join.left_table_type,
                  rightTableType: join.right_table_type,
                  joinType: join.join_type,
                  joinKeys: join.join_keys,
                  status: join.status || 'pending',
                  outputTableName: join.output_table_name,
                  errorMessage: join.error_message
                },
                onViewData: (joinId: number, joinName: string) => {
                  setDataViewerSource({
                    id: `join-${joinId}`,
                    type: 'join',
                    name: `${joinName} Output`
                  })
                  setDataViewerOpen(true)
                },
                onEdit: (joinId: number) => {
                },
                onUpdateJoin: async (joinId: number, joinConfig: any) => {
                  try {
                    // Transform data to match backend API format
                    const leftTableData = availableTables.find(t => t.id === joinConfig.leftTable)
                    const rightTableData = availableTables.find(t => t.id === joinConfig.rightTable)
                    
                    if (!leftTableData || !rightTableData) {
                      throw new Error('Selected tables not found')
                    }
                    
                    // Determine table types and original IDs using helper function
                    const { type: leftTableType, id: leftTableId } = getTableTypeAndId(joinConfig.leftTable)
                    const { type: rightTableType, id: rightTableId } = getTableTypeAndId(joinConfig.rightTable)
                    
                    const response = await fetch(getApiUrl(`/projects/${projectId}/joins/${joinId}`), {
                      method: 'PUT',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        project_id: projectId,
                        name: joinConfig.name,
                        output_table_name: joinConfig.outputTableName,
                        left_table_id: leftTableId,
                        right_table_id: rightTableId,
                        left_table_type: leftTableType,
                        right_table_type: rightTableType,
                        join_type: joinConfig.joinType,
                        join_keys: joinConfig.joinKeys,
                        canvas_position: { x: 0, y: 0 } // Preserve existing position or use default
                      }),
                    })
                    
                    if (response.ok) {
                      // Refresh the join nodes by refetching project data
                      const joinsResponse = await fetch(getApiUrl(`/projects/${projectId}/joins`))
                      if (joinsResponse.ok) {
                        const joinsData = await joinsResponse.json()
                        // The useEffect will handle updating the nodes
                      }
                    } else {
                      try {
                        const error = await response.json()
                        const errorMessage = error.detail || error.message || JSON.stringify(error)
                        alert(`Failed to update join: ${errorMessage}`)
                      } catch (parseError) {
                        alert(`Failed to update join: HTTP ${response.status} ${response.statusText}`)
                      }
                    }
                  } catch (error) {
                    console.error('Error updating join:', error)
                    alert(`Failed to update join: ${error instanceof Error ? error.message : 'Please try again.'}`)
                  }
                },
                availableTables,
                onDelete: async (joinId: number) => {
                  if (window.confirm('Are you sure you want to delete this join? This action cannot be undone.')) {
                    try {
                      const deleteResponse = await fetch(getApiUrl(`/projects/${projectId}/joins/${joinId}`), {
                        method: 'DELETE',
                      })
                      
                      if (deleteResponse.ok) {
                        setNodes(nodes => nodes.filter(node => node.id !== `join-${joinId}`))
                        setHasUnsavedChanges(true)
                      } else {
                        alert('Failed to delete join. Please try again.')
                      }
                    } catch (error) {
                      console.error('Error deleting join:', error)
                      alert('Failed to delete join. Please try again.')
                    }
                  }
                },
                onExecute: async (joinId: number) => {
                  try {
                    setNodes(nodes => nodes.map(node => {
                      if (node.id === `join-${joinId}`) {
                        return {
                          ...node,
                          data: {
                            ...node.data,
                            join: {
                              ...node.data.join,
                              status: 'running'
                            }
                          }
                        }
                      }
                      return node
                    }))

                    const executeResponse = await fetch(getApiUrl(`/projects/${projectId}/joins/${joinId}/execute`), {
                      method: 'POST',
                    })
                    
                    if (executeResponse.ok) {
                      const result = await executeResponse.json()
                      
                      setNodes(nodes => nodes.map(node => {
                        if (node.id === `join-${joinId}`) {
                          return {
                            ...node,
                            data: {
                              ...node.data,
                              join: {
                                ...node.data.join,
                                status: 'completed'
                              }
                            }
                          }
                        }
                        return node
                      }))
                      
                      alert(`Join executed successfully! ${result.row_count} rows created in ${result.execution_time_ms}ms`)
                    } else {
                      const error = await executeResponse.json()
                      
                      // Fetch the updated join data to get the error message
                      try {
                        const joinsResponse = await fetch(getApiUrl(`/projects/${projectId}/joins`))
                        if (joinsResponse.ok) {
                          const joinsData = await joinsResponse.json()
                          const failedJoin = joinsData.joins.find((j: any) => j.id === joinId)
                          
                          setNodes(nodes => nodes.map(node => {
                            if (node.id === `join-${joinId}`) {
                              return {
                                ...node,
                                data: {
                                  ...node.data,
                                  join: {
                                    ...node.data.join,
                                    status: 'failed',
                                    errorMessage: failedJoin?.error_message || error.detail || 'Join execution failed'
                                  }
                                }
                              }
                            }
                            return node
                          }))
                        }
                      } catch (fetchError) {
                        // Fallback to just setting status if fetch fails
                        setNodes(nodes => nodes.map(node => {
                          if (node.id === `join-${joinId}`) {
                            return {
                              ...node,
                              data: {
                                ...node.data,
                                join: {
                                  ...node.data.join,
                                  status: 'failed',
                                  errorMessage: error.detail || 'Join execution failed'
                                }
                              }
                            }
                          }
                          return node
                        }))
                      }
                      
                      alert(`Failed to execute join: ${error.detail}`)
                    }
                  } catch (error) {
                    console.error('Error executing join:', error)
                    
                    setNodes(nodes => nodes.map(node => {
                      if (node.id === `join-${joinId}`) {
                        return {
                          ...node,
                          data: {
                            ...node.data,
                            join: {
                              ...node.data.join,
                              status: 'failed',
                              errorMessage: error instanceof Error ? error.message : 'Join execution failed'
                            }
                          }
                        }
                      }
                      return node
                    }))
                    
                    alert('Failed to execute join. Please try again.')
                  }
                }
              }
            })
          })
        }
      } catch (error) {
        console.error('Error loading joins:', error)
      }

      // Add qualitative data nodes
      qualitativeDataOperations.forEach((operation) => {
        const savedNode = savedLayout?.nodes?.find((n: any) => n.id === `qualitative-${operation.id}`)
        const position = savedNode?.position || operation.canvas_position || { x: 600, y: 300 }
        
        initialNodes.push({
          id: `qualitative-${operation.id}`,
          type: 'qualitativeDataNode',
          position,
          data: {
            operation,
            availableTables: qualitativeAvailableTables,
            onViewData: (operationId: number, operationName: string) => {
              setDataViewerSource({
                id: `qualitative-${operationId}`,
                type: 'qualitative',
                name: `${operationName} Output`
              })
              setDataViewerOpen(true)
            },
            onEdit: (operationId: number) => {
              // Find the operation to edit
              const operationToEdit = qualitativeDataOperations.find(op => op.id === operationId)
              console.log('DEBUG: Edit operation found:', operationToEdit)
              if (operationToEdit) {
                setEditingQualitativeOperation(operationToEdit)
                setShowQualitativeModal(true)
              }
            },
            onDelete: async (operationId: number) => {
              if (window.confirm('Are you sure you want to delete this qualitative analysis? This action cannot be undone.')) {
                try {
                  const deleteResponse = await fetch(getApiUrl(`/projects/${projectId}/qualitative-data/${operationId}`), {
                    method: 'DELETE',
                  })
                  
                  if (deleteResponse.ok) {
                    setNodes(nodes => nodes.filter(node => node.id !== `qualitative-${operationId}`))
                    setHasUnsavedChanges(true)
                  } else {
                    alert('Failed to delete qualitative analysis. Please try again.')
                  }
                } catch (error) {
                  console.error('Error deleting qualitative analysis:', error)
                  alert('Failed to delete qualitative analysis. Please try again.')
                }
              }
            },
            onExecute: async (operationId: number) => {
              try {
                setNodes(nodes => nodes.map(node => {
                  if (node.id === `qualitative-${operationId}`) {
                    return {
                      ...node,
                      data: {
                        ...node.data,
                        operation: {
                          ...node.data.operation,
                          status: 'running'
                        }
                      }
                    }
                  }
                  return node
                }))

                const executeResponse = await fetch(getApiUrl(`/projects/${projectId}/qualitative-data/${operationId}/execute`), {
                  method: 'POST',
                })
                
                if (executeResponse.ok) {
                  const result = await executeResponse.json()
                  
                  setNodes(nodes => nodes.map(node => {
                    if (node.id === `qualitative-${operationId}`) {
                      return {
                        ...node,
                        data: {
                          ...node.data,
                          operation: {
                            ...node.data.operation,
                            status: 'completed',
                            output_table_name: result.output_table_name,
                            total_records_processed: result.total_records_processed,
                            batch_count: result.batch_count,
                            execution_time_ms: result.execution_time_ms,
                            error_message: undefined  // Clear any previous error messages
                          }
                        }
                      }
                    }
                    return node
                  }))
                  
                  alert(`Qualitative analysis completed successfully! Processed ${result.total_records_processed} records in ${(result.execution_time_ms / 1000).toFixed(1)}s`)
                  
                  // Refresh qualitative data operations list so completed operation appears in dropdowns
                  if (onQualitativeDataCreated) {
                    await onQualitativeDataCreated()
                  }
                } else {
                  const error = await executeResponse.json()
                  
                  setNodes(nodes => nodes.map(node => {
                    if (node.id === `qualitative-${operationId}`) {
                      return {
                        ...node,
                        data: {
                          ...node.data,
                          operation: {
                            ...node.data.operation,
                            status: 'failed',
                            error_message: error.detail || 'Qualitative analysis failed'
                          }
                        }
                      }
                    }
                    return node
                  }))
                  
                  alert(`Failed to execute qualitative analysis: ${error.detail}`)
                }
              } catch (error) {
                console.error('Error executing qualitative analysis:', error)
                
                setNodes(nodes => nodes.map(node => {
                  if (node.id === `qualitative-${operationId}`) {
                    return {
                      ...node,
                      data: {
                        ...node.data,
                        operation: {
                          ...node.data.operation,
                          status: 'failed',
                          error_message: error instanceof Error ? error.message : 'Qualitative analysis failed'
                        }
                      }
                    }
                  }
                  return node
                }))
                
                alert('Failed to execute qualitative analysis. Please try again.')
              }
            }
          }
        })
      })

    // Only update nodes if there's a meaningful difference, but preserve positions
    setNodes(prevNodes => {
      const hasChanges = prevNodes.length !== initialNodes.length ||
        prevNodes.some(prevNode => {
          const newNode = initialNodes.find(n => n.id === prevNode.id)
          if (!newNode) return true
          
          // For transformation nodes, check if data has actually changed
          if (newNode.type === 'transformationNode' && prevNode.type === 'transformationNode') {
            const prevStep = prevNode.data.step
            const newStep = newNode.data.step
            return prevStep.status !== newStep.status || 
                   prevStep.code_explanation !== newStep.code_explanation ||
                   prevStep.error_message !== newStep.error_message ||
                   prevStep.step_name !== newStep.step_name
          }
          return false
        })
      
      if (hasChanges) {
        // Preserve existing positions, dimensions, and other properties when updating
        return initialNodes.map(newNode => {
          const existingNode = prevNodes.find(n => n.id === newNode.id)
          if (existingNode) {
            // Preserve the current position, dimensions, and style unless it's a brand new node
            return {
              ...newNode,
              position: existingNode.position,
              width: existingNode.width,
              height: existingNode.height,
              style: existingNode.style
            }
          }
          return newNode
        })
      }
      
      return prevNodes
    })
    }
    
    initializeCanvas()
  }, [sheets, transformationSteps, qualitativeDataOperations, onUpdateTransformationStep, onExecuteStep, projectId, setEdges, onQualitativeDataCreated])

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge(params, eds))
      setHasUnsavedChanges(true)
      // Save connections immediately after creating them
      setTimeout(() => {
        saveCanvasLayout()
      }, 100)
    },
    [setEdges, saveCanvasLayout]
  )

  const onPaneClick = useCallback((event: React.MouseEvent) => {
    // Close dropdown and context menu when clicking on canvas
    setShowCreateDropdown(false)
    setContextMenu(null)
  }, [])

  const handleCreateStep = async () => {
    if (!newStepName.trim() || !newStepPrompt.trim() || isCreatingStep) return

    setIsCreatingStep(true)
    try {
      // Parse selected upstream nodes into sheet IDs and step IDs
      const upstream_sheet_ids: number[] = []
      const upstream_step_ids: number[] = []

      selectedUpstreamNodes.forEach(nodeId => {
        if (nodeId.startsWith('sheet-')) {
          upstream_sheet_ids.push(parseInt(nodeId.replace('sheet-', '')))
        } else if (nodeId.startsWith('step-')) {
          upstream_step_ids.push(parseInt(nodeId.replace('step-', '')))
        } else if (nodeId.startsWith('join-')) {
          // For joins, we might need to handle them differently in the backend
          // For now, we'll treat them similar to transformation steps
          upstream_step_ids.push(parseInt(nodeId.replace('join-', '')))
        }
      })

      await onCreateTransformationStep({
        step_name: newStepName,
        user_prompt: newStepPrompt,
        output_table_name: newOutputTableName.trim() || undefined,
        upstream_sheet_ids,
        upstream_step_ids,
        canvas_position: createModalPosition
      })

      // Reset modal
      setShowCreateModal(false)
      setNewStepName('')
      setNewStepPrompt('')
      setNewOutputTableName('')
      setSelectedUpstreamNodes([])
    } catch (error) {
      console.error('Failed to create transformation step:', error)
    } finally {
      setIsCreatingStep(false)
    }
  }

  const handleExecuteAll = async () => {
    if (!onExecuteAll || isExecutingAll) return
    
    try {
      setIsExecutingAll(true)
      await onExecuteAll()
    } catch (error) {
      console.error('Failed to execute all transformations:', error)
    } finally {
      setIsExecutingAll(false)
    }
  }

  const handleViewSheetData = (sheetId: number, sheetName: string) => {
    setDataViewerSource({
      id: `sheet-${sheetId}`,
      type: 'sheet',
      name: sheetName
    })
    setDataViewerOpen(true)
  }

  const handleViewTransformationData = (stepId: number, stepName: string, status: string) => {
    if (status !== 'completed') return
    
    setDataViewerSource({
      id: `transform-${stepId}`,
      type: 'transformation',
      name: `${stepName} Output`,
      transformationStep: stepName
    })
    setDataViewerOpen(true)
  }

  const handleDeleteTransformationStep = async (stepId: number) => {
    if (!onDeleteTransformationStep) return

    // Show confirmation dialog
    if (window.confirm('Are you sure you want to delete this transformation step? This action cannot be undone.')) {
      try {
        await onDeleteTransformationStep(stepId)
      } catch (error) {
        console.error('Failed to delete transformation step:', error)
        alert('Failed to delete transformation step. Please try again.')
      }
    }
  }

  const onNodeDragStop = useCallback(
    (event: React.MouseEvent, node: Node) => {
      // Update the position in the database immediately
      if (node.id.startsWith('step-')) {
        const stepId = parseInt(node.id.replace('step-', ''))
        onUpdateTransformationStep(stepId, {
          canvas_position: node.position
        }).catch(error => {
          console.error('Failed to update node position:', error)
        })
      }
      
      // Also trigger auto-save for the overall layout
      setHasUnsavedChanges(true)
      // Save immediately after drag stop
      setTimeout(() => {
        saveCanvasLayout()
      }, 100)
    },
    [onUpdateTransformationStep, saveCanvasLayout]
  )


  // Context menu handlers
  const handlePaneContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
    })
  }, [])

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  const handleCreateAITransformation = useCallback(() => {
    if (contextMenu) {
      // Center the modal on screen instead of using context menu position
      const centerX = window.innerWidth / 2 - 192 // 192 is half of modal width (384px/w-96)
      const centerY = window.innerHeight / 2 - 200 // Approximate half of modal height
      setTransformModalPosition({ x: Math.max(20, centerX), y: Math.max(20, centerY) })
      setShowCreateModal(true)
    }
  }, [contextMenu])

  // AI Transformation modal drag functionality
  const handleTransformModalMouseDown = useCallback((e: React.MouseEvent) => {
    setIsTransformModalDragging(true)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setTransformModalDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    })
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isTransformModalDragging) {
        const newX = Math.max(0, Math.min(window.innerWidth - 384, e.clientX - transformModalDragOffset.x))
        const newY = Math.max(0, Math.min(window.innerHeight - 100, e.clientY - transformModalDragOffset.y))
        setTransformModalPosition({ x: newX, y: newY })
      }
    }

    const handleMouseUp = () => {
      setIsTransformModalDragging(false)
    }

    if (isTransformModalDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isTransformModalDragging, transformModalDragOffset])

  // Close dropdown and context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showCreateDropdown) {
        const dropdown = document.querySelector('.create-dropdown')
        if (dropdown && !dropdown.contains(event.target as Element)) {
          setShowCreateDropdown(false)
        }
      }
      if (contextMenu) {
        const contextMenuElement = document.querySelector('.context-menu')
        if (contextMenuElement && !contextMenuElement.contains(event.target as Element)) {
          setContextMenu(null)
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showCreateDropdown, contextMenu])

  const handleCreateJoin = useCallback(() => {
    if (contextMenu) {
      // Convert screen coordinates to canvas coordinates
      const canvasRect = document.querySelector('.react-flow')?.getBoundingClientRect()
      if (canvasRect) {
        const canvasX = contextMenu.x - canvasRect.left - 100
        const canvasY = contextMenu.y - canvasRect.top - 50
        setJoinModalPosition({ x: Math.max(0, canvasX), y: Math.max(0, canvasY) })
      } else {
        setJoinModalPosition({ x: 200, y: 200 })
      }
      setShowJoinModal(true)
    }
  }, [contextMenu])

  const handleCreateQualitativeData = useCallback(() => {
    if (contextMenu) {
      // Convert screen coordinates to canvas coordinates
      const canvasRect = document.querySelector('.react-flow')?.getBoundingClientRect()
      if (canvasRect) {
        const canvasX = contextMenu.x - canvasRect.left - 100
        const canvasY = contextMenu.y - canvasRect.top - 50
        setQualitativeModalPosition({ x: Math.max(0, canvasX), y: Math.max(0, canvasY) })
      } else {
        setQualitativeModalPosition({ x: 200, y: 200 })
      }
      setShowQualitativeModal(true)
    }
  }, [contextMenu])

  // Available tables for join (sheets + completed transformations + completed joins + completed qualitative)
  const availableTables = useMemo(() => {
    const tables = [
      // Add sheets as available tables
      ...sheets.map(sheet => ({
        id: sheet.id,
        name: sheet.title,
        columns: sheet.columns,
        type: 'sheet' as const
      })),
      // Add completed transformation steps as available tables
      ...transformationSteps
        .filter(step => step.status === 'completed')
        .map(step => ({
          id: step.id + 10000, // Offset to avoid conflicts with sheet IDs
          name: step.step_name,
          columns: step.output_columns || [],
          type: 'transformation' as const
        })),
      // Add completed joins as available tables
      ...joins
        .filter(join => join.status === 'completed')
        .map(join => ({
          id: join.id + 20000, // Offset to avoid conflicts with sheet and transformation IDs
          name: join.output_table_name || join.name,
          columns: join.output_columns || [], // Use join output columns
          type: 'join' as const // Use correct join type
        })),
      // Add completed qualitative operations as available tables
      ...qualitativeDataOperations
        .filter(op => op.status === 'completed')
        .map(op => ({
          id: op.id + 30000, // Offset to avoid conflicts with other IDs
          name: op.output_table_name || op.name,
          columns: [], // Columns will be fetched dynamically from the actual database table
          type: 'qualitative' as const
        }))
    ]
    return tables
  }, [sheets, transformationSteps, joins, qualitativeDataOperations])

  // Available tables for qualitative analysis (all table types)
  const qualitativeAvailableTables = useMemo(() => {
    const tables = [
      // Add sheets as available tables
      ...sheets.map(sheet => ({
        id: sheet.id,
        name: sheet.title,
        columns: sheet.columns,
        type: 'sheet' as const
      })),
      // Add completed transformation steps as available tables
      ...transformationSteps
        .filter(step => step.status === 'completed')
        .map(step => ({
          id: step.id,
          name: step.step_name,
          columns: step.output_columns || [],
          type: 'transformation' as const
        })),
      // Add completed joins as available tables
      ...joins
        .filter(join => join.status === 'completed')
        .map(join => ({
          id: join.id,
          name: join.output_table_name || join.name,
          columns: join.output_columns || [],
          type: 'join' as const
        })),
      // Add completed qualitative operations as available tables
      ...qualitativeDataOperations
        .filter(op => op.status === 'completed')
        .map(op => ({
          id: op.id,
          name: op.output_table_name || op.name,
          columns: [], // Columns will be fetched dynamically from the actual database table
          type: 'qualitative' as const
        }))
    ]
    return tables
  }, [sheets, transformationSteps, joins, qualitativeDataOperations])

  // Helper function to determine table type and original ID from offset ID
  const getTableTypeAndId = useCallback((offsetId: number) => {
    if (offsetId >= 30000) {
      // Qualitative operation
      return { type: 'qualitative', id: offsetId - 30000 }
    } else if (offsetId >= 20000) {
      // Join operation
      return { type: 'join', id: offsetId - 20000 }
    } else if (offsetId >= 10000) {
      // Transformation
      return { type: 'transformation', id: offsetId - 10000 }
    } else {
      // Sheet
      return { type: 'sheet', id: offsetId }
    }
  }, [])

  const handleCreateJoinSubmit = useCallback(async (joinConfig: {
    name: string
    outputTableName?: string
    leftTable: number
    rightTable: number
    joinType: 'inner' | 'left' | 'right' | 'full'
    joinKeys: { left: string; right: string }[]
  }) => {
    try {
      // Determine table types and adjust IDs for backend
      const leftTableData = availableTables.find(t => t.id === joinConfig.leftTable)
      const rightTableData = availableTables.find(t => t.id === joinConfig.rightTable)
      
      if (!leftTableData || !rightTableData) {
        throw new Error('Selected tables not found')
      }
      
      // Determine table types and original IDs using helper function
      const { type: leftTableType, id: leftTableId } = getTableTypeAndId(joinConfig.leftTable)
      const { type: rightTableType, id: rightTableId } = getTableTypeAndId(joinConfig.rightTable)
      
      // Create join via backend API
      const response = await fetch(getApiUrl(`/projects/${projectId}/joins`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          project_id: projectId,
          name: joinConfig.name,
          output_table_name: joinConfig.outputTableName,
          left_table_id: leftTableId,
          right_table_id: rightTableId,
          left_table_type: leftTableType,
          right_table_type: rightTableType,
          join_type: joinConfig.joinType,
          join_keys: joinConfig.joinKeys,
          canvas_position: joinModalPosition
        }),
      })

      if (!response.ok) {
        let errorMessage = 'Failed to create join'
        try {
          const error = await response.json()
          console.error('Join creation error response:', error)
          console.error('Error type:', typeof error)
          console.error('Error keys:', Object.keys(error))

          if (typeof error === 'string') {
            errorMessage = error
          } else if (error.detail) {
            errorMessage = Array.isArray(error.detail)
              ? error.detail.map(d => typeof d === 'object' ? d.msg || JSON.stringify(d) : d).join(', ')
              : error.detail
          } else if (error.message) {
            errorMessage = error.message
          } else {
            errorMessage = JSON.stringify(error)
          }
        } catch (e) {
          console.error('Error parsing response:', e)
          errorMessage = `HTTP ${response.status} ${response.statusText}`
        }
        throw new Error(errorMessage)
      }

      const result = await response.json()
      
      // Create a new join node with the real backend ID
      const newJoinNode: Node = {
        id: `join-${result.join_id}`,
        type: 'joinNode',
        position: joinModalPosition,
        data: {
          join: {
            id: result.join_id,
            name: joinConfig.name,
            leftTable: leftTableData.name,
            rightTable: rightTableData.name,
            joinType: joinConfig.joinType,
            joinKeys: joinConfig.joinKeys,
            status: 'pending' as const,
            outputTableName: result.output_table_name || joinConfig.outputTableName
          },
          onViewData: (joinId: number, joinName: string) => {
            setDataViewerSource({
              id: `join-${joinId}`,
              type: 'join',
              name: `${joinName} Output`
            })
            setDataViewerOpen(true)
          },
          onEdit: (joinId: number) => {
          },
          onUpdateJoin: async (joinId: number, joinConfig: any) => {
            try {
              // Transform data to match backend API format
              const leftTableData = availableTables.find(t => t.id === joinConfig.leftTable)
              const rightTableData = availableTables.find(t => t.id === joinConfig.rightTable)
              
              if (!leftTableData || !rightTableData) {
                throw new Error('Selected tables not found')
              }
              
              // Determine table types and original IDs using helper function
              const { type: leftTableType, id: leftTableId } = getTableTypeAndId(joinConfig.leftTable)
              const { type: rightTableType, id: rightTableId } = getTableTypeAndId(joinConfig.rightTable)
              
              const response = await fetch(getApiUrl(`/projects/${projectId}/joins/${joinId}`), {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  project_id: projectId,
                  name: joinConfig.name,
                  output_table_name: joinConfig.outputTableName,
                  left_table_id: leftTableId,
                  right_table_id: rightTableId,
                  left_table_type: leftTableType,
                  right_table_type: rightTableType,
                  join_type: joinConfig.joinType,
                  join_keys: joinConfig.joinKeys,
                  canvas_position: { x: 0, y: 0 } // Preserve existing position or use default
                }),
              })
              
              if (response.ok) {
                // Refresh the join nodes by refetching project data
                const joinsResponse = await fetch(getApiUrl(`/projects/${projectId}/joins`))
                if (joinsResponse.ok) {
                  const joinsData = await joinsResponse.json()
                  // The useEffect will handle updating the nodes
                }
              } else {
                try {
                  const error = await response.json()
                  const errorMessage = error.detail || error.message || JSON.stringify(error)
                  alert(`Failed to update join: ${errorMessage}`)
                } catch (parseError) {
                  alert(`Failed to update join: HTTP ${response.status} ${response.statusText}`)
                }
              }
            } catch (error) {
              console.error('Error updating join:', error)
              alert(`Failed to update join: ${error instanceof Error ? error.message : 'Please try again.'}`)
            }
          },
          availableTables,
          onDelete: async (joinId: number) => {
            if (window.confirm('Are you sure you want to delete this join? This action cannot be undone.')) {
              try {
                const deleteResponse = await fetch(getApiUrl(`/projects/${projectId}/joins/${joinId}`), {
                  method: 'DELETE',
                })
                
                if (deleteResponse.ok) {
                  setNodes(nodes => nodes.filter(node => node.id !== `join-${joinId}`))
                  setHasUnsavedChanges(true)
                } else {
                  alert('Failed to delete join. Please try again.')
                }
              } catch (error) {
                console.error('Error deleting join:', error)
                alert('Failed to delete join. Please try again.')
              }
            }
          },
          onExecute: async (joinId: number) => {
            try {
              setNodes(nodes => nodes.map(node => {
                if (node.id === `join-${joinId}`) {
                  return {
                    ...node,
                    data: {
                      ...node.data,
                      join: {
                        ...node.data.join,
                        status: 'running'
                      }
                    }
                  }
                }
                return node
              }))

              const executeResponse = await fetch(getApiUrl(`/projects/${projectId}/joins/${joinId}/execute`), {
                method: 'POST',
              })
              
              if (executeResponse.ok) {
                const result = await executeResponse.json()
                
                setNodes(nodes => nodes.map(node => {
                  if (node.id === `join-${joinId}`) {
                    return {
                      ...node,
                      data: {
                        ...node.data,
                        join: {
                          ...node.data.join,
                          status: 'completed'
                        }
                      }
                    }
                  }
                  return node
                }))
                
                alert(`Join executed successfully! ${result.row_count} rows created in ${result.execution_time_ms}ms`)
              } else {
                const error = await executeResponse.json()
                
                setNodes(nodes => nodes.map(node => {
                  if (node.id === `join-${joinId}`) {
                    return {
                      ...node,
                      data: {
                        ...node.data,
                        join: {
                          ...node.data.join,
                          status: 'failed'
                        }
                      }
                    }
                  }
                  return node
                }))
                
                alert(`Failed to execute join: ${error.detail}`)
              }
            } catch (error) {
              console.error('Error executing join:', error)
              
              setNodes(nodes => nodes.map(node => {
                if (node.id === `join-${joinId}`) {
                  return {
                    ...node,
                    data: {
                      ...node.data,
                      join: {
                        ...node.data.join,
                        status: 'failed'
                      }
                    }
                  }
                }
                return node
              }))
              
              alert('Failed to execute join. Please try again.')
            }
          }
        }
      }

      // Add the node to the canvas
      setNodes(nodes => [...nodes, newJoinNode])
      setHasUnsavedChanges(true)
      
      // Notify parent component about the new join
      if (onJoinCreated) {
        await onJoinCreated()
      }
      
    } catch (error) {
      console.error('Error creating join:', error)
      let errorMessage = 'An unexpected error occurred'
      if (error instanceof Error) {
        errorMessage = error.message
      } else if (typeof error === 'object' && error !== null) {
        errorMessage = JSON.stringify(error)
      }
      alert(`Failed to create join: ${errorMessage}`)
    }
  }, [joinModalPosition, availableTables, projectId, getTableTypeAndId])

  const handleCreateQualitativeDataSubmit = useCallback(async (operationConfig: {
    name: string
    source_table_id: number
    source_table_type: 'sheet' | 'transformation' | 'join' | 'qualitative'
    qualitative_column: string
    analysis_type: 'sentiment' | 'summarization'
    aggregation_column?: string
    summarize_sentiment_analysis?: boolean
    sentiment_column?: string
    output_table_name?: string
  }) => {
    try {
      // Create qualitative data operation via backend API
      const response = await fetch(getApiUrl(`/projects/${projectId}/qualitative-data`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          project_id: projectId,
          name: operationConfig.name,
          source_table_id: operationConfig.source_table_id,
          source_table_type: operationConfig.source_table_type,
          qualitative_column: operationConfig.qualitative_column,
          analysis_type: operationConfig.analysis_type,
          aggregation_column: operationConfig.aggregation_column,
          summarize_sentiment_analysis: operationConfig.summarize_sentiment_analysis,
          sentiment_column: operationConfig.sentiment_column,
          canvas_position: qualitativeModalPosition,
          output_table_name: operationConfig.output_table_name
        }),
      })

      if (!response.ok) {
        let errorMessage = 'Failed to create qualitative analysis'
        try {
          const error = await response.json()
          if (error.detail) {
            errorMessage = Array.isArray(error.detail)
              ? error.detail.map(d => typeof d === 'object' ? d.msg || JSON.stringify(d) : d).join(', ')
              : error.detail
          } else if (error.message) {
            errorMessage = error.message
          }
        } catch (e) {
          errorMessage = `HTTP ${response.status} ${response.statusText}`
        }
        throw new Error(errorMessage)
      }

      const result = await response.json()
      
      // Create a new qualitative data node
      const newQualitativeNode: Node = {
        id: `qualitative-${result.operation_id}`,
        type: 'qualitativeDataNode',
        position: qualitativeModalPosition,
        data: {
          operation: {
            id: result.operation_id,
            name: operationConfig.name,
            source_table_id: operationConfig.source_table_id,
            source_table_type: operationConfig.source_table_type,
            qualitative_column: operationConfig.qualitative_column,
            analysis_type: operationConfig.analysis_type,
            status: 'pending' as const,
            canvas_position: qualitativeModalPosition
          },
          onViewData: (operationId: number, operationName: string) => {
            setDataViewerSource({
              id: `qualitative-${operationId}`,
              type: 'qualitative',
              name: `${operationName} Output`
            })
            setDataViewerOpen(true)
          },
          onEdit: (operationId: number) => {
            console.log('Edit qualitative operation:', operationId)
          },
          onDelete: async (operationId: number) => {
            if (window.confirm('Are you sure you want to delete this qualitative analysis? This action cannot be undone.')) {
              try {
                const deleteResponse = await fetch(getApiUrl(`/projects/${projectId}/qualitative-data/${operationId}`), {
                  method: 'DELETE',
                })
                
                if (deleteResponse.ok) {
                  setNodes(nodes => nodes.filter(node => node.id !== `qualitative-${operationId}`))
                  setHasUnsavedChanges(true)
                } else {
                  alert('Failed to delete qualitative analysis. Please try again.')
                }
              } catch (error) {
                console.error('Error deleting qualitative analysis:', error)
                alert('Failed to delete qualitative analysis. Please try again.')
              }
            }
          },
          onExecute: async (operationId: number) => {
            try {
              setNodes(nodes => nodes.map(node => {
                if (node.id === `qualitative-${operationId}`) {
                  return {
                    ...node,
                    data: {
                      ...node.data,
                      operation: {
                        ...node.data.operation,
                        status: 'running'
                      }
                    }
                  }
                }
                return node
              }))

              const executeResponse = await fetch(getApiUrl(`/projects/${projectId}/qualitative-data/${operationId}/execute`), {
                method: 'POST',
              })
              
              if (executeResponse.ok) {
                const result = await executeResponse.json()
                
                setNodes(nodes => nodes.map(node => {
                  if (node.id === `qualitative-${operationId}`) {
                    return {
                      ...node,
                      data: {
                        ...node.data,
                        operation: {
                          ...node.data.operation,
                          status: 'completed',
                          output_table_name: result.output_table_name,
                          total_records_processed: result.total_records_processed,
                          batch_count: result.batch_count,
                          execution_time_ms: result.execution_time_ms,
                          error_message: undefined  // Clear any previous error messages
                        }
                      }
                    }
                  }
                  return node
                }))
                
                alert(`Qualitative analysis completed successfully! Processed ${result.total_records_processed} records in ${(result.execution_time_ms / 1000).toFixed(1)}s`)
              } else {
                const error = await executeResponse.json()
                
                setNodes(nodes => nodes.map(node => {
                  if (node.id === `qualitative-${operationId}`) {
                    return {
                      ...node,
                      data: {
                        ...node.data,
                        operation: {
                          ...node.data.operation,
                          status: 'failed',
                          error_message: error.detail || 'Qualitative analysis failed'
                        }
                      }
                    }
                  }
                  return node
                }))
                
                alert(`Failed to execute qualitative analysis: ${error.detail}`)
              }
            } catch (error) {
              console.error('Error executing qualitative analysis:', error)
              
              setNodes(nodes => nodes.map(node => {
                if (node.id === `qualitative-${operationId}`) {
                  return {
                    ...node,
                    data: {
                      ...node.data,
                      operation: {
                        ...node.data.operation,
                        status: 'failed',
                        error_message: error instanceof Error ? error.message : 'Qualitative analysis failed'
                      }
                    }
                  }
                }
                return node
              }))
              
              alert('Failed to execute qualitative analysis. Please try again.')
            }
          }
        }
      }

      // Add the node to the canvas
      setNodes(nodes => [...nodes, newQualitativeNode])
      setHasUnsavedChanges(true)
      
      // Notify parent component about the new qualitative operation
      if (onQualitativeDataCreated) {
        await onQualitativeDataCreated()
      }
      
    } catch (error) {
      console.error('Error creating qualitative data operation:', error)
      let errorMessage = 'An unexpected error occurred'
      if (error instanceof Error) {
        errorMessage = error.message
      }
      alert(`Failed to create qualitative analysis: ${errorMessage}`)
    }
  }, [qualitativeModalPosition, projectId, onQualitativeDataCreated])

  // Handle updating qualitative data operations
  const handleUpdateQualitativeDataSubmit = useCallback(async (operationConfig: {
    name: string
    source_table_id: number
    source_table_type: 'sheet' | 'transformation' | 'join' | 'qualitative'
    qualitative_column: string
    analysis_type: 'sentiment' | 'summarization'
    aggregation_column?: string
    summarize_sentiment_analysis?: boolean
    sentiment_column?: string
    output_table_name?: string
  }) => {
    if (!editingQualitativeOperation) return

    try {
      // Update qualitative data operation via backend API
      const response = await fetch(getApiUrl(`/projects/${projectId}/qualitative-data/${editingQualitativeOperation.id}`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: operationConfig.name,
          source_table_id: operationConfig.source_table_id,
          source_table_type: operationConfig.source_table_type,
          qualitative_column: operationConfig.qualitative_column,
          analysis_type: operationConfig.analysis_type,
          aggregation_column: operationConfig.aggregation_column,
          summarize_sentiment_analysis: operationConfig.summarize_sentiment_analysis,
          sentiment_column: operationConfig.sentiment_column,
          output_table_name: operationConfig.output_table_name
        }),
      })

      if (!response.ok) {
        let errorMessage = 'Failed to update qualitative analysis'
        try {
          const errorData = await response.json()
          if (errorData.detail) {
            errorMessage = errorData.detail
          }
        } catch {
          // If we can't parse the error, use the status text
          errorMessage = `Failed to update qualitative analysis: ${response.statusText}`
        }
        throw new Error(errorMessage)
      }

      // Update the node in the canvas
      setNodes(nodes => nodes.map(node => {
        if (node.id === `qualitative-${editingQualitativeOperation.id}`) {
          return {
            ...node,
            data: {
              ...node.data,
              operation: {
                ...node.data.operation,
                name: operationConfig.name,
                source_table_id: operationConfig.source_table_id,
                source_table_type: operationConfig.source_table_type,
                qualitative_column: operationConfig.qualitative_column,
                analysis_type: operationConfig.analysis_type,
                output_table_name: operationConfig.output_table_name
              }
            }
          }
        }
        return node
      }))
      
      setHasUnsavedChanges(true)
      
      // Notify parent component about the updated qualitative operation
      if (onQualitativeDataCreated) {
        await onQualitativeDataCreated()
      }
      
      // Close modal
      setShowQualitativeModal(false)
      setEditingQualitativeOperation(null)
      
    } catch (error) {
      console.error('Error updating qualitative data operation:', error)
      let errorMessage = 'An unexpected error occurred'
      if (error instanceof Error) {
        errorMessage = error.message
      }
      alert(`Failed to update qualitative analysis: ${errorMessage}`)
    }
  }, [editingQualitativeOperation, projectId, onQualitativeDataCreated])

  return (
    <div className="h-full w-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onPaneClick={onPaneClick}
        onPaneContextMenu={handlePaneContextMenu}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        className="bg-gray-50"
        minZoom={0.2}
        maxZoom={4}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
      >
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            switch (node.type) {
              case 'sheetNode':
                return '#3B82F6'
              case 'transformationNode':
                return '#10B981'
              case 'joinNode':
                return '#8B5CF6'
              case 'qualitativeDataNode':
                return '#A855F7'
              default:
                return '#6B7280'
            }
          }}
        />
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
      </ReactFlow>

      {/* Canvas Toolbar */}
      <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg border p-3 flex items-center gap-2">
        <button
          onClick={handleExecuteAll}
          disabled={isExecutingAll || (transformationSteps.length === 0 && joins.length === 0 && qualitativeDataOperations.length === 0)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium transition-colors ${
            isExecutingAll || (transformationSteps.length === 0 && joins.length === 0 && qualitativeDataOperations.length === 0)
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          {isExecutingAll ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
          {isExecutingAll ? 'Running All...' : 'Run All'}
          {(transformationSteps.length > 0 || joins.length > 0 || qualitativeDataOperations.length > 0) && !isExecutingAll && (
            <span className="text-xs bg-white/20 px-1.5 py-0.5 rounded">
              {transformationSteps.length + joins.length + qualitativeDataOperations.length}
            </span>
          )}
        </button>

        {/* Create Transformation Dropdown */}
        <div className="relative create-dropdown">
          <button
            onClick={() => setShowCreateDropdown(!showCreateDropdown)}
            className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
          >
            <Plus size={16} />
            Create Transform
            <ChevronDown size={16} />
          </button>
          
          {showCreateDropdown && (
            <div className="absolute top-full mt-2 left-0 bg-white rounded-lg shadow-lg border min-w-[200px] z-10">
              <button
                onClick={() => {
                  setShowCreateDropdown(false)
                  const centerX = window.innerWidth / 2 - 192
                  const centerY = window.innerHeight / 2 - 200
                  setTransformModalPosition({ x: Math.max(20, centerX), y: Math.max(20, centerY) })
                  setShowCreateModal(true)
                }}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3 border-b border-gray-100"
              >
                <Zap size={16} className="text-green-600" />
                <div>
                  <div className="font-medium text-gray-900">AI Transformation</div>
                  <div className="text-xs text-gray-500">Transform data with natural language</div>
                </div>
              </button>
              
              <button
                onClick={() => {
                  setShowCreateDropdown(false)
                  const canvasRect = document.querySelector('.react-flow')?.getBoundingClientRect()
                  if (canvasRect) {
                    const canvasX = window.innerWidth / 2 - canvasRect.left - 100
                    const canvasY = window.innerHeight / 2 - canvasRect.top - 50
                    setJoinModalPosition({ x: Math.max(0, canvasX), y: Math.max(0, canvasY) })
                  } else {
                    setJoinModalPosition({ x: 200, y: 200 })
                  }
                  setShowJoinModal(true)
                }}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3 border-b border-gray-100"
              >
                <Plus size={16} className="text-blue-600" />
                <div>
                  <div className="font-medium text-gray-900">Join Tables</div>
                  <div className="text-xs text-gray-500">Combine data from multiple sources</div>
                </div>
              </button>
              
              <button
                onClick={() => {
                  setShowCreateDropdown(false)
                  const canvasRect = document.querySelector('.react-flow')?.getBoundingClientRect()
                  if (canvasRect) {
                    const canvasX = window.innerWidth / 2 - canvasRect.left - 100
                    const canvasY = window.innerHeight / 2 - canvasRect.top - 50
                    setQualitativeModalPosition({ x: Math.max(0, canvasX), y: Math.max(0, canvasY) })
                  } else {
                    setQualitativeModalPosition({ x: 200, y: 200 })
                  }
                  setShowQualitativeModal(true)
                }}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3"
              >
                <Brain size={16} className="text-purple-600" />
                <div>
                  <div className="font-medium text-gray-900">Qualitative Analysis</div>
                  <div className="text-xs text-gray-500">Analyze text data with AI sentiment & summarization</div>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>
      
      {/* Save Status Indicator */}
      <div className="absolute top-4 right-4 bg-white rounded-lg shadow-sm border px-3 py-2 text-xs">
        {isSaving ? (
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-blue-600">Saving...</span>
          </div>
        ) : hasUnsavedChanges ? (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
            <span className="text-orange-600">Unsaved changes</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-green-600">All changes saved</span>
          </div>
        )}
      </div>


      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={handleCloseContextMenu}
          onCreateAITransformation={handleCreateAITransformation}
          onCreateJoin={handleCreateJoin}
          onCreateQualitativeData={handleCreateQualitativeData}
        />
      )}

      {/* Create Transformation Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div 
            className="bg-white rounded-lg shadow-xl max-h-[80vh] overflow-y-auto absolute"
            style={{
              left: transformModalPosition.x,
              top: transformModalPosition.y,
              width: '384px',
              cursor: isTransformModalDragging ? 'grabbing' : 'default'
            }}
          >
            <div 
              className="flex items-center justify-between p-6 border-b border-gray-200 cursor-grab active:cursor-grabbing"
              onMouseDown={handleTransformModalMouseDown}
            >
              <div className="flex items-center gap-2">
                <Zap className="text-green-600" size={20} />
                <h3 className="text-lg font-semibold text-gray-900">Create AI Transformation</h3>
              </div>
              <button
                onClick={() => {
                  setShowCreateModal(false)
                  setIsCreatingStep(false)
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Step Name
                </label>
                <input
                  type="text"
                  value={newStepName}
                  onChange={(e) => setNewStepName(e.target.value)}
                  placeholder="e.g., Clean Data, Combine Names, Filter Active Users"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Transformation Description
                </label>
                <textarea
                  value={newStepPrompt}
                  onChange={(e) => setNewStepPrompt(e.target.value)}
                  placeholder="Describe what you want to do in plain English. For example: 'Delete the xyz column and add a new column that combines first_name and last_name columns with a space between them'"
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
                  value={newOutputTableName}
                  onChange={(e) => setNewOutputTableName(e.target.value)}
                  placeholder="e.g., cleaned_customer_data, monthly_sales_summary"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  If left empty, a name will be generated automatically. Use lowercase letters, numbers, and underscores only.
                </p>
              </div>

              {/* Upstream Node Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Data Source <span className="text-red-500">*</span>
                </label>
                <p className="text-sm text-gray-600 mb-3">
                  Select which data source(s) this transformation should operate on:
                </p>
                <div className="space-y-2 max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-3">
                  {/* Sheet Nodes */}
                  {sheets.map((sheet) => (
                    <label key={`sheet-${sheet.id}`} className="flex items-center p-2 hover:bg-gray-50 rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedUpstreamNodes.includes(`sheet-${sheet.id}`)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedUpstreamNodes(prev => [...prev, `sheet-${sheet.id}`])
                          } else {
                            setSelectedUpstreamNodes(prev => prev.filter(id => id !== `sheet-${sheet.id}`))
                          }
                        }}
                        className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-blue-600 rounded"></div>
                        <span className="font-medium text-gray-900">{sheet.title}</span>
                        <span className="text-sm text-gray-500">(Original Sheet)</span>
                      </div>
                    </label>
                  ))}

                  {/* Transformation Step Nodes */}
                  {transformationSteps.filter(step => step.status === 'completed').map((step) => (
                    <label key={`step-${step.id}`} className="flex items-center p-2 hover:bg-gray-50 rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedUpstreamNodes.includes(`step-${step.id}`)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedUpstreamNodes(prev => [...prev, `step-${step.id}`])
                          } else {
                            setSelectedUpstreamNodes(prev => prev.filter(id => id !== `step-${step.id}`))
                          }
                        }}
                        className="mr-3 h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                      />
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-green-600 rounded"></div>
                        <span className="font-medium text-gray-900">{step.step_name}</span>
                        <span className="text-sm text-gray-500">(Transformation Output)</span>
                      </div>
                    </label>
                  ))}

                  {/* Join Nodes */}
                  {joins.filter(join => join.status === 'completed').map((join) => (
                    <label key={`join-${join.id}`} className="flex items-center p-2 hover:bg-gray-50 rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedUpstreamNodes.includes(`join-${join.id}`)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedUpstreamNodes(prev => [...prev, `join-${join.id}`])
                          } else {
                            setSelectedUpstreamNodes(prev => prev.filter(id => id !== `join-${join.id}`))
                          }
                        }}
                        className="mr-3 h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                      />
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-purple-600 rounded"></div>
                        <span className="font-medium text-gray-900">{join.output_table_name || join.name}</span>
                        <span className="text-sm text-gray-500">(Join Output)</span>
                      </div>
                    </label>
                  ))}
                </div>
                {selectedUpstreamNodes.length === 0 && (
                  <p className="text-sm text-red-600 mt-1">Please select at least one data source</p>
                )}
              </div>

              <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded">
                <strong>Tips:</strong>
                <ul className="mt-1 space-y-1">
                  <li>• Be specific about column names</li>
                  <li>• Mention the exact operations you want</li>
                  <li>• Use examples when helpful</li>
                </ul>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 p-6 border-t border-gray-200">
              <button
                onClick={() => {
                  setShowCreateModal(false)
                  setNewStepName('')
                  setNewStepPrompt('')
                  setNewOutputTableName('')
                  setSelectedUpstreamNodes([])
                  setIsCreatingStep(false)
                }}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateStep}
                disabled={!newStepName.trim() || !newStepPrompt.trim() || selectedUpstreamNodes.length === 0 || isCreatingStep}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                {isCreatingStep && <Loader2 size={16} className="animate-spin" />}
                {isCreatingStep ? 'Generating...' : 'Generate Transform'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Data Viewer Modal */}
      {dataViewerOpen && dataViewerSource && (
        <DataViewer
          isOpen={dataViewerOpen}
          onClose={() => {
            setDataViewerOpen(false)
            setDataViewerSource(null)
          }}
          sourceId={dataViewerSource.id}
          sourceType={dataViewerSource.type}
          sourceName={dataViewerSource.name}
          transformationStep={dataViewerSource.transformationStep}
        />
      )}

      {/* Join Modal */}
      <JoinModal
        isOpen={showJoinModal}
        onClose={() => setShowJoinModal(false)}
        onCreateJoin={handleCreateJoinSubmit}
        position={joinModalPosition}
        availableTables={availableTables}
      />

      {/* Qualitative Data Modal */}
      <QualitativeDataModal
        isOpen={showQualitativeModal}
        onClose={() => {
          setShowQualitativeModal(false)
          setEditingQualitativeOperation(null)
        }}
        onCreateOperation={editingQualitativeOperation ? handleUpdateQualitativeDataSubmit : handleCreateQualitativeDataSubmit}
        position={qualitativeModalPosition}
        availableTables={qualitativeAvailableTables}
        initialOperation={editingQualitativeOperation}
      />
    </div>
  )
}