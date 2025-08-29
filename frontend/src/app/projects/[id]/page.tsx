'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Database, RefreshCw, ExternalLink, BarChart3, Plus, Eye, Settings, Users, Zap, CheckCircle, AlertCircle } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import Navigation from '@/components/Navigation'

interface ConnectedSheet {
  id: number
  spreadsheet_id: string
  spreadsheet_url: string
  title: string
  sheet_name: string
  total_rows: number
  columns: string[]
}

interface TransformationProject {
  id: number
  name: string
  description: string
  mode: string
  sheet_ids: number[]
  join_config: any
  transformations: any[]
  created_at: string
  updated_at: string
}

interface Chart {
  id: number
  chart_name: string
  chart_type: string
  x_axis_column: string
  y_axis_column: string
  created_at: string
}

interface JoinPreview {
  total_rows: number
  preview_data: string[][]
  columns: string[]
  join_stats: {
    left_rows: number
    right_rows: number
    joined_rows: number
    join_type: string
  }
}

export default function ProjectDetailsPage({ params }: { params: { id: string } }) {
  const { isAuthenticated, logout } = useAuth()
  const router = useRouter()
  const [project, setProject] = useState<TransformationProject | null>(null)
  const [sheets, setSheets] = useState<ConnectedSheet[]>([])
  const [charts, setCharts] = useState<Chart[]>([])
  const [joinPreview, setJoinPreview] = useState<JoinPreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [selectedJoinColumn, setSelectedJoinColumn] = useState<string>('')
  const [advancedConfig, setAdvancedConfig] = useState({
    joinType: 'inner',
    leftColumn: '',
    rightColumn: '',
    filters: [],
    transformations: []
  })
  const [expertConfig, setExpertConfig] = useState({
    customQuery: '',
    pipeline: []
  })
  const [savingTransformation, setSavingTransformation] = useState(false)
  const [executingPipeline, setExecutingPipeline] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/')
      return
    }
    fetchProjectData()
  }, [isAuthenticated, router])

  const fetchProjectData = async () => {
    try {
      // Fetch project details
      const projectResponse = await fetch(`http://localhost:8000/projects/${params.id}`)
      if (!projectResponse.ok) {
        router.push('/home')
        return
      }
      const projectData = await projectResponse.json()
      setProject(projectData)

      // Fetch all sheets to get details of project sheets
      const sheetsResponse = await fetch('http://localhost:8000/sheets/connected')
      if (sheetsResponse.ok) {
        const sheetsData = await sheetsResponse.json()
        const projectSheets = sheetsData.sheets.filter((sheet: ConnectedSheet) => 
          projectData.sheet_ids.includes(sheet.id)
        )
        setSheets(projectSheets)
      }

      // Fetch charts for this project
      const chartsResponse = await fetch(`http://localhost:8000/projects/${params.id}/charts`)
      if (chartsResponse.ok) {
        const chartsData = await chartsResponse.json()
        setCharts(chartsData.charts)
      }
    } catch (error) {
      console.error('Error fetching project data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handlePreviewJoin = async () => {
    if (!project || sheets.length < 2) return
    
    setPreviewLoading(true)
    try {
      let joinConfig: any = { mode: project.mode }
      
      if (project.mode === 'simple') {
        if (!selectedJoinColumn) return
        joinConfig = {
          ...joinConfig,
          join_type: 'inner',
          left_sheet_id: sheets[0].id,
          right_sheet_id: sheets[1].id, 
          left_column: selectedJoinColumn,
          right_column: selectedJoinColumn
        }
      } else if (project.mode === 'advanced') {
        if (!advancedConfig.leftColumn || !advancedConfig.rightColumn) {
          alert('Please select both left and right columns for advanced join')
          return
        }
        joinConfig = {
          ...joinConfig,
          join_type: advancedConfig.joinType,
          left_sheet_id: sheets[0].id,
          right_sheet_id: sheets[1].id,
          left_column: advancedConfig.leftColumn,
          right_column: advancedConfig.rightColumn,
          transformations: advancedConfig.transformations
        }
      } else if (project.mode === 'expert') {
        if (!expertConfig.customQuery.trim()) {
          alert('Please enter a custom SQL query for expert mode')
          return
        }
        joinConfig = {
          ...joinConfig,
          custom_query: expertConfig.customQuery
        }
      }

      const response = await fetch(`http://localhost:8000/projects/${project.id}/preview-join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(joinConfig)
      })
      
      if (response.ok) {
        const data = await response.json()
        setJoinPreview(data)
      } else {
        const errorData = await response.json()
        alert(`Preview failed: ${errorData.detail}`)
      }
    } catch (error) {
      console.error('Error previewing join:', error)
      alert('Failed to generate preview. Please try again.')
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleModeChange = async (newMode: string) => {
    try {
      const response = await fetch(`http://localhost:8000/projects/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: newMode })
      })
      
      if (response.ok) {
        setProject({ ...project, mode: newMode })
      }
    } catch (error) {
      console.error('Error updating project mode:', error)
    }
  }

  const getCommonColumns = () => {
    if (sheets.length < 2) return []
    
    // Find columns that exist in all sheets
    const firstSheetColumns = sheets[0].columns
    return firstSheetColumns.filter(column => 
      sheets.every(sheet => sheet.columns.includes(column))
    )
  }

  const getAllColumns = () => {
    const allColumns: { sheet: string, column: string }[] = []
    sheets.forEach(sheet => {
      sheet.columns.forEach(column => {
        allColumns.push({ sheet: sheet.title, column })
      })
    })
    return allColumns
  }

  const handleSaveTransformation = async () => {
    if (!project) return
    
    setSavingTransformation(true)
    try {
      let transformConfig: any = {}
      
      if (project.mode === 'simple') {
        transformConfig = {
          join_type: 'inner',
          left_sheet_id: sheets[0].id,
          right_sheet_id: sheets[1].id,
          left_column: selectedJoinColumn,
          right_column: selectedJoinColumn
        }
      } else if (project.mode === 'advanced') {
        transformConfig = {
          join_type: advancedConfig.joinType,
          left_sheet_id: sheets[0].id,
          right_sheet_id: sheets[1].id,
          left_column: advancedConfig.leftColumn,
          right_column: advancedConfig.rightColumn
        }
        
        // Add transformations
        const transformations = []
        const checkboxes = document.querySelectorAll('input[type="checkbox"]:checked')
        checkboxes.forEach((checkbox: any) => {
          const parent = checkbox.closest('.flex')
          const label = parent?.querySelector('.font-medium')?.textContent
          if (label === 'Remove Duplicates') transformations.push({ type: 'remove_duplicates' })
          if (label === 'Filter Null Values') transformations.push({ type: 'filter_nulls' })
          if (label === 'Standardize Text Case') transformations.push({ type: 'standardize_case' })
        })
        
        if (transformations.length > 0) {
          transformConfig.transformations = transformations
        }
      } else if (project.mode === 'expert') {
        transformConfig = {
          custom_query: expertConfig.customQuery
        }
      }

      // Save configuration and trigger pipeline
      const response = await fetch(`http://localhost:8000/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          join_config: transformConfig,
          transformations: transformConfig.transformations || []
        })
      })
      
      if (response.ok) {
        // Refresh project data to get updated pipeline status
        await fetchProjectData()
        alert('Transformation saved and pipeline started!')
      } else {
        const errorData = await response.json()
        alert(`Save failed: ${errorData.detail}`)
      }
    } catch (error) {
      console.error('Error saving transformation:', error)
      alert('Failed to save transformation. Please try again.')
    } finally {
      setSavingTransformation(false)
    }
  }

  const handleManualSync = async () => {
    if (!project) return
    
    setExecutingPipeline(true)
    try {
      const response = await fetch(`http://localhost:8000/projects/${project.id}/execute-pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      
      if (response.ok) {
        // Immediately update pipeline status to running
        setProject(prev => ({ ...prev, pipeline_status: 'running' }))
        
        // Poll for status updates
        const pollStatus = setInterval(async () => {
          try {
            const statusResponse = await fetch(`http://localhost:8000/projects/${project.id}`)
            if (statusResponse.ok) {
              const updatedProject = await statusResponse.json()
              setProject(updatedProject)
              
              // Stop polling when pipeline completes
              if (updatedProject.pipeline_status !== 'running') {
                clearInterval(pollStatus)
                setExecutingPipeline(false)
                // Refresh chart data
                fetchProjectData()
              }
            }
          } catch (error) {
            console.error('Error polling status:', error)
            clearInterval(pollStatus)
            setExecutingPipeline(false)
          }
        }, 2000) // Poll every 2 seconds
        
        // Stop polling after 5 minutes max
        setTimeout(() => {
          clearInterval(pollStatus)
          setExecutingPipeline(false)
        }, 300000)
        
      } else {
        const errorData = await response.json()
        alert(`Pipeline execution failed: ${errorData.detail}`)
        setExecutingPipeline(false)
      }
    } catch (error) {
      console.error('Error executing pipeline:', error)
      alert('Failed to execute pipeline. Please try again.')
      setExecutingPipeline(false)
    }
  }

  const handleScheduleUpdate = async (frequency: string) => {
    if (!project) return
    
    try {
      const scheduleConfig = frequency ? { frequency, enabled: true } : { enabled: false }
      
      const response = await fetch(`http://localhost:8000/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule_config: scheduleConfig })
      })
      
      if (response.ok) {
        const updatedProject = await response.json()
        setProject(updatedProject)
        alert(frequency ? 'Schedule updated successfully!' : 'Schedule disabled successfully!')
      } else {
        const errorData = await response.json()
        alert(`Schedule update failed: ${errorData.detail}`)
      }
    } catch (error) {
      console.error('Error updating schedule:', error)
      alert('Failed to update schedule. Please try again.')
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation isAuthenticated={isAuthenticated} onLogout={logout} />
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
        </div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation isAuthenticated={isAuthenticated} onLogout={logout} />
        <div className="text-center py-20">
          <p className="text-gray-600">Project not found</p>
        </div>
      </div>
    )
  }

  const commonColumns = getCommonColumns()

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation isAuthenticated={isAuthenticated} onLogout={logout} />
      
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/home')}
            className="inline-flex items-center gap-2 text-green-600 hover:text-green-700 font-medium mb-4"
          >
            <ArrowLeft size={20} />
            Back to Dashboard
          </button>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="bg-green-600 text-white rounded p-2">
                  <Database size={24} />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">{project.name}</h1>
                  <p className="text-gray-600">Transformation Project</p>
                </div>
              </div>
              <p className="text-gray-700 mt-2">{project.description}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center bg-gray-100 rounded-lg p-1">
                {['simple', 'advanced', 'expert'].map((mode) => (
                  <button
                    key={mode}
                    onClick={() => handleModeChange(mode)}
                    className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                      project.mode === mode 
                        ? 'bg-green-600 text-white shadow-sm' 
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Pipeline Status Banner */}
        {project.pipeline_status && (
          <div className={`mb-6 border rounded-xl p-4 ${
            project.pipeline_status === 'completed' ? 'bg-green-50 border-green-200' :
            project.pipeline_status === 'running' ? 'bg-yellow-50 border-yellow-200' :
            project.pipeline_status === 'draft' ? 'bg-blue-50 border-blue-200' :
            'bg-red-50 border-red-200'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded ${
                  project.pipeline_status === 'completed' ? 'bg-green-600 text-white' :
                  project.pipeline_status === 'running' ? 'bg-yellow-600 text-white' :
                  project.pipeline_status === 'draft' ? 'bg-blue-600 text-white' :
                  'bg-red-600 text-white'
                }`}>
                  {project.pipeline_status === 'completed' ? <CheckCircle size={20} /> :
                   project.pipeline_status === 'running' ? <RefreshCw size={20} className="animate-spin" /> :
                   project.pipeline_status === 'draft' ? <Settings size={20} /> :
                   <AlertCircle size={20} />}
                </div>
                <div>
                  <h3 className={`font-semibold ${
                    project.pipeline_status === 'completed' ? 'text-green-900' :
                    project.pipeline_status === 'running' ? 'text-yellow-900' :
                    project.pipeline_status === 'draft' ? 'text-blue-900' :
                    'text-red-900'
                  }`}>
                    {project.pipeline_status === 'completed' ? 'Data Pipeline Complete' :
                     project.pipeline_status === 'running' ? 'Pipeline Processing Data' :
                     project.pipeline_status === 'draft' ? 'Configuration Ready' :
                     'Pipeline Failed'}
                  </h3>
                  <p className={`text-sm ${
                    project.pipeline_status === 'completed' ? 'text-green-700' :
                    project.pipeline_status === 'running' ? 'text-yellow-700' :
                    project.pipeline_status === 'draft' ? 'text-blue-700' :
                    'text-red-700'
                  }`}>
                    {project.pipeline_status === 'completed' && (
                      <>
                        Transformed data ready • Last sync: {project.last_pipeline_run ? formatDate(project.last_pipeline_run) : 'Unknown'}
                        {project.schedule_config?.enabled && (
                          <span className="ml-2 inline-flex items-center">
                            • Next sync: {project.schedule_config.frequency}
                          </span>
                        )}
                      </>
                    )}
                    {project.pipeline_status === 'running' && 'Processing your transformation configuration...'}
                    {project.pipeline_status === 'draft' && 'Configure your transformations below and save to execute pipeline'}
                    {project.pipeline_status === 'failed' && 'Pipeline encountered an error. Try manual sync or check configuration.'}
                  </p>
                </div>
              </div>
              
              {project.pipeline_status === 'failed' && (
                <button
                  onClick={handleManualSync}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
                >
                  <RefreshCw size={16} />
                  Retry Pipeline
                </button>
              )}
              
              {project.pipeline_status === 'completed' && project.schedule_config?.enabled && (
                <div className="text-sm text-green-700 bg-green-100 px-3 py-2 rounded-lg">
                  Auto-sync: {project.schedule_config.frequency}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Mode Description */}
        <div className="mb-8 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-green-600 text-white rounded p-2">
              {project.mode === 'simple' ? <Users size={20} /> : 
               project.mode === 'advanced' ? <Settings size={20} /> : 
               <Zap size={20} />}
            </div>
            <h3 className="text-lg font-semibold text-gray-900 capitalize">{project.mode} Mode</h3>
          </div>
          <p className="text-gray-700 text-sm">
            {project.mode === 'simple' && 'Join sheets using common column names with automatic matching.'}
            {project.mode === 'advanced' && 'Configure custom join types, column mappings, and data transformations.'}
            {project.mode === 'expert' && 'Write custom SQL queries for complex data operations and transformations.'}
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Project Information & Configuration */}
          <div className="lg:col-span-1 space-y-6">
            {/* Project Details */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Project Details</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Mode</label>
                  <p className="text-gray-900 capitalize">{project.mode}</p>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-500">Data Sources</label>
                  <p className="text-gray-900">{sheets.length} sheets</p>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-500">Total Rows</label>
                  <p className="text-gray-900">{sheets.reduce((sum, sheet) => sum + sheet.total_rows, 0).toLocaleString()}</p>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-500">Created</label>
                  <p className="text-gray-900">{formatDate(project.created_at)}</p>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-500">Last Updated</label>
                  <p className="text-gray-900">{formatDate(project.updated_at)}</p>
                </div>

                {project.pipeline_status === 'completed' && (
                  <div className="mt-4 text-xs text-green-600">
                    Data warehouse contains {project.warehouse_table_name ? 'transformed data' : 'processed results'}
                  </div>
                )}
              </div>
            </div>

            {/* Data Sources */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Data Sources</h2>
              
              <div className="space-y-3">
                {sheets.map((sheet) => (
                  <div key={sheet.id} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="bg-blue-600 text-white rounded p-1">
                        <Database size={12} />
                      </div>
                      <h4 className="font-medium text-gray-900 text-sm">{sheet.title}</h4>
                    </div>
                    <div className="text-xs text-gray-600">
                      {sheet.total_rows.toLocaleString()} rows • {sheet.columns.length} columns
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={() => router.push(`/sheets/${sheet.id}`)}
                        className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                      >
                        View Details
                      </button>
                      <a
                        href={sheet.spreadsheet_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-gray-600 hover:text-gray-700"
                      >
                        Open in Google Sheets
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="lg:col-span-2 space-y-6">
            {/* Configuration Section - Changes based on mode */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <Users className="text-green-600" size={24} />
                  <h2 className="text-lg font-semibold text-gray-900">
                    {project.mode === 'simple' ? 'Join Configuration' : 
                     project.mode === 'advanced' ? 'Advanced Data Operations' : 
                     'Expert Configuration'}
                  </h2>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handlePreviewJoin}
                    disabled={previewLoading || (project.mode === 'simple' && !selectedJoinColumn)}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-4 py-2 rounded-lg flex items-center gap-2"
                  >
                    <Eye size={16} />
                    {previewLoading ? 'Processing...' : 'Preview'}
                  </button>
                  
                  {joinPreview && (
                    <button
                      onClick={handleSaveTransformation}
                      disabled={previewLoading || savingTransformation}
                      className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white px-4 py-2 rounded-lg flex items-center gap-2"
                    >
                      <CheckCircle size={16} className={savingTransformation ? 'animate-spin' : ''} />
                      {savingTransformation ? 'Saving...' : 'Save & Execute Pipeline'}
                    </button>
                  )}
                  
                  {project.pipeline_status === 'running' && (
                    <div className="flex items-center gap-2 text-green-600">
                      <RefreshCw size={16} className="animate-spin" />
                      <span className="text-sm font-medium">Pipeline Running...</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Simple Mode */}
              {project.mode === 'simple' && (
                <>
                  {commonColumns.length === 0 ? (
                    <div className="text-center py-8">
                      <AlertCircle className="mx-auto text-yellow-500 mb-4" size={48} />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No Common Columns Found</h3>
                      <p className="text-gray-600 mb-4">
                        Your selected sheets don't share column names. Switch to Advanced mode for more join options.
                      </p>
                      <button
                        onClick={() => handleModeChange('advanced')}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg"
                      >
                        Switch to Advanced Mode
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-sm text-gray-600">
                        Select columns to join your {sheets.length} sheets on:
                      </p>
                      
                      <div className="grid gap-3">
                        {commonColumns.map((column) => (
                          <div key={column} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg">
                            <div className="flex items-center">
                              <input
                                type="radio"
                                id={`join-${column}`}
                                name="join-column"
                                value={column}
                                checked={selectedJoinColumn === column}
                                onChange={() => setSelectedJoinColumn(column)}
                                className="text-green-600 focus:ring-green-500"
                              />
                              <label htmlFor={`join-${column}`} className="ml-2 font-medium text-gray-900">
                                {column}
                              </label>
                            </div>
                            <span className="text-xs text-gray-500">
                              Available in all {sheets.length} sheets
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Advanced Mode */}
              {project.mode === 'advanced' && (
                <div className="space-y-6">
                  {/* Join Type Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">Join Type</label>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { value: 'inner', label: 'Inner Join', desc: 'Only matching records' },
                        { value: 'left', label: 'Left Join', desc: 'All from left + matching' },
                        { value: 'right', label: 'Right Join', desc: 'All from right + matching' },
                        { value: 'outer', label: 'Full Outer', desc: 'All records from both' }
                      ].map((joinType) => (
                        <div
                          key={joinType.value}
                          onClick={() => setAdvancedConfig(prev => ({ ...prev, joinType: joinType.value }))}
                          className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                            advancedConfig.joinType === joinType.value 
                              ? 'border-green-500 bg-green-50' 
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="font-medium text-sm">{joinType.label}</div>
                          <div className="text-xs text-gray-500">{joinType.desc}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Column Mapping */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Left Sheet Column</label>
                      <select
                        value={advancedConfig.leftColumn}
                        onChange={(e) => setAdvancedConfig(prev => ({ ...prev, leftColumn: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2"
                      >
                        <option value="">Select column...</option>
                        {sheets[0]?.columns.map(col => (
                          <option key={col} value={col}>{col}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Right Sheet Column</label>
                      <select
                        value={advancedConfig.rightColumn}
                        onChange={(e) => setAdvancedConfig(prev => ({ ...prev, rightColumn: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2"
                      >
                        <option value="">Select column...</option>
                        {sheets[1]?.columns.map(col => (
                          <option key={col} value={col}>{col}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Data Transformations */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">Data Transformations</label>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg">
                        <input type="checkbox" className="text-green-600 focus:ring-green-500" />
                        <div className="flex-1">
                          <div className="font-medium text-sm">Remove Duplicates</div>
                          <div className="text-xs text-gray-500">Remove duplicate rows from the result</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg">
                        <input type="checkbox" className="text-green-600 focus:ring-green-500" />
                        <div className="flex-1">
                          <div className="font-medium text-sm">Filter Null Values</div>
                          <div className="text-xs text-gray-500">Exclude rows with empty join columns</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg">
                        <input type="checkbox" className="text-green-600 focus:ring-green-500" />
                        <div className="flex-1">
                          <div className="font-medium text-sm">Standardize Text Case</div>
                          <div className="text-xs text-gray-500">Convert all text to lowercase for consistency</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Expert Mode */}
              {project.mode === 'expert' && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Custom SQL Query</label>
                    <div className="text-xs text-gray-600 mb-3">
                      Available tables: {sheets.map((sheet, idx) => `sheet_${idx + 1} (${sheet.title})`).join(', ')}
                    </div>
                    <textarea
                      value={expertConfig.customQuery}
                      onChange={(e) => setExpertConfig(prev => ({ ...prev, customQuery: e.target.value }))}
                      placeholder={`SELECT * FROM sheet_1 
LEFT JOIN sheet_2 ON sheet_1.id = sheet_2.id
WHERE sheet_1.status = 'active'
ORDER BY sheet_1.created_at DESC`}
                      className="w-full h-32 border border-gray-300 rounded-lg px-3 py-2 font-mono text-sm"
                    />
                  </div>
                  
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <h4 className="font-medium text-yellow-800 mb-2">Expert Mode</h4>
                    <p className="text-sm text-yellow-700">
                      Write custom SQL queries to join and transform your data. 
                      Use table aliases sheet_1, sheet_2, etc. for your connected sheets.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Pipeline Visualization */}
            {(project.join_config || joinPreview) && (
              <div className="bg-white rounded-xl shadow-sm border p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <Zap className="text-green-600" size={24} />
                    <h2 className="text-lg font-semibold text-gray-900">Transformation Pipeline</h2>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleManualSync}
                      disabled={project.pipeline_status === 'running' || executingPipeline}
                      className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-4 py-2 rounded-lg flex items-center gap-2"
                    >
                      <RefreshCw size={16} className={executingPipeline ? 'animate-spin' : ''} />
                      {executingPipeline ? 'Syncing...' : 'Manual Sync'}
                    </button>
                  </div>
                </div>

                {/* Data Lineage Diagram */}
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-gray-700 mb-4">Data Flow</h3>
                  <div className="flex items-center justify-between bg-gray-50 rounded-lg p-4">
                    {/* Source Sheets */}
                    <div className="flex flex-col items-center">
                      <div className="flex gap-2 mb-2">
                        {sheets.slice(0, 2).map((sheet, idx) => (
                          <div key={sheet.id} className="bg-blue-100 border border-blue-300 rounded-lg p-3 text-center">
                            <Database size={20} className="text-blue-600 mx-auto mb-1" />
                            <div className="text-xs font-medium text-blue-900">{sheet.title}</div>
                            <div className="text-xs text-blue-700">{sheet.total_rows} rows</div>
                          </div>
                        ))}
                      </div>
                      <div className="text-xs text-gray-600">Source Data</div>
                    </div>

                    {/* Arrow */}
                    <div className="flex flex-col items-center mx-4">
                      <div className="text-green-600">→</div>
                      <div className="text-xs text-gray-600 mt-1">
                        {project.mode === 'simple' && 'Auto Join'}
                        {project.mode === 'advanced' && `${project.join_config?.join_type || 'Inner'} Join`}
                        {project.mode === 'expert' && 'Custom SQL'}
                      </div>
                    </div>

                    {/* Transformed Data */}
                    <div className="flex flex-col items-center">
                      <div className={`border rounded-lg p-3 text-center ${
                        project.pipeline_status === 'completed' ? 'bg-green-100 border-green-300' :
                        project.pipeline_status === 'running' ? 'bg-yellow-100 border-yellow-300' :
                        project.pipeline_status === 'failed' ? 'bg-red-100 border-red-300' :
                        'bg-gray-100 border-gray-300'
                      }`}>
                        <Database size={20} className={`mx-auto mb-1 ${
                          project.pipeline_status === 'completed' ? 'text-green-600' :
                          project.pipeline_status === 'running' ? 'text-yellow-600' :
                          project.pipeline_status === 'failed' ? 'text-red-600' :
                          'text-gray-600'
                        }`} />
                        <div className="text-xs font-medium">Warehouse</div>
                        <div className="text-xs">
                          {project.pipeline_status === 'completed' && joinPreview ? `${joinPreview.total_rows} rows` :
                           project.pipeline_status === 'running' ? 'Processing...' :
                           project.pipeline_status === 'failed' ? 'Failed' : 'Ready'}
                        </div>
                      </div>
                      <div className="text-xs text-gray-600 mt-1">Transformed Data</div>
                    </div>

                    {/* Arrow to Charts */}
                    <div className="flex flex-col items-center mx-4">
                      <div className="text-green-600">→</div>
                      <div className="text-xs text-gray-600 mt-1">Visualize</div>
                    </div>

                    {/* Charts */}
                    <div className="flex flex-col items-center">
                      <div className="bg-purple-100 border border-purple-300 rounded-lg p-3 text-center">
                        <BarChart3 size={20} className="text-purple-600 mx-auto mb-1" />
                        <div className="text-xs font-medium text-purple-900">Charts</div>
                        <div className="text-xs text-purple-700">{charts.length} created</div>
                      </div>
                      <div className="text-xs text-gray-600 mt-1">Insights</div>
                    </div>
                  </div>
                </div>

                {/* Saved Configuration Display */}
                {project.join_config && (
                  <div className="mb-6">
                    <h3 className="text-sm font-medium text-gray-700 mb-3">Saved Configuration</h3>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-gray-600">Mode:</span>
                          <span className="ml-2 font-medium capitalize">{project.mode}</span>
                        </div>
                        {project.join_config.join_type && (
                          <div>
                            <span className="text-gray-600">Join Type:</span>
                            <span className="ml-2 font-medium capitalize">{project.join_config.join_type}</span>
                          </div>
                        )}
                        {project.join_config.left_column && (
                          <div>
                            <span className="text-gray-600">Join Column:</span>
                            <span className="ml-2 font-medium">{project.join_config.left_column}</span>
                          </div>
                        )}
                        {project.transformations?.length > 0 && (
                          <div>
                            <span className="text-gray-600">Transforms:</span>
                            <span className="ml-2 font-medium">{project.transformations.length} applied</span>
                          </div>
                        )}
                      </div>
                      
                      {project.transformations?.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <div className="text-xs text-gray-600 mb-2">Applied Transformations:</div>
                          <div className="flex flex-wrap gap-2">
                            {project.transformations.map((transform, idx) => (
                              <span key={idx} className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs">
                                {transform.type?.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Pipeline Controls & Scheduling */}
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-3">Pipeline Control</h3>
                    <div className="space-y-3">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div>
                            <div className="text-sm font-medium">Pipeline Status</div>
                            <div className={`text-xs ${
                              project.pipeline_status === 'completed' ? 'text-green-600' :
                              project.pipeline_status === 'running' ? 'text-yellow-600' :
                              project.pipeline_status === 'failed' ? 'text-red-600' : 'text-gray-600'
                            }`}>
                              {project.pipeline_status === 'completed' ? '✓ Data Ready in Warehouse' :
                               project.pipeline_status === 'running' ? '⟳ Transforming Data...' :
                               project.pipeline_status === 'failed' ? '✗ Pipeline Failed' : '○ Configuration Draft'}
                            </div>
                          </div>
                          {project.pipeline_status === 'completed' && (
                            <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-medium">
                              Live
                            </span>
                          )}
                        </div>

                        {/* Pipeline Steps Visualization */}
                        {project.pipeline_status !== 'draft' && (
                          <div className="bg-white border border-gray-200 rounded-lg p-3">
                            <div className="text-xs font-medium text-gray-700 mb-2">Pipeline Steps</div>
                            <div className="space-y-2">
                              {[
                                { step: 'Fetch Source Data', status: 'completed' },
                                { step: 'Apply Transformations', status: project.pipeline_status === 'running' ? 'running' : 'completed' },
                                { step: 'Store in Warehouse', status: project.pipeline_status === 'completed' ? 'completed' : project.pipeline_status },
                                { step: 'Update Charts', status: project.pipeline_status === 'completed' ? 'completed' : 'pending' }
                              ].map((step, idx) => (
                                <div key={idx} className="flex items-center gap-2 text-xs">
                                  <div className={`w-2 h-2 rounded-full ${
                                    step.status === 'completed' ? 'bg-green-500' :
                                    step.status === 'running' ? 'bg-yellow-500 animate-pulse' :
                                    step.status === 'failed' ? 'bg-red-500' : 'bg-gray-300'
                                  }`}></div>
                                  <span className={step.status === 'completed' ? 'text-gray-900' : 'text-gray-600'}>
                                    {step.step}
                                  </span>
                                  {step.status === 'running' && <RefreshCw size={12} className="animate-spin text-yellow-600" />}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {project.last_pipeline_run && (
                        <div className="text-xs text-gray-600">
                          Last sync: {formatDate(project.last_pipeline_run)}
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-3">Schedule Automation</h3>
                    <div className="space-y-3">
                      <select 
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        value={project.schedule_config?.frequency || ""}
                        onChange={(e) => handleScheduleUpdate(e.target.value)}
                      >
                        <option value="">No schedule</option>
                        <option value="hourly">Every hour</option>
                        <option value="daily">Daily at 6 AM</option>
                        <option value="weekly">Weekly on Monday</option>
                        <option value="monthly">Monthly on 1st</option>
                      </select>
                      
                      <div className="text-xs text-gray-600">
                        {project.schedule_config?.enabled ? (
                          <span className="text-green-600 font-medium">
                            ✓ Auto-sync active: {project.schedule_config.frequency}
                          </span>
                        ) : (
                          'Automatically sync when source data changes'
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Join Preview */}
            {joinPreview && (
              <div className="bg-white rounded-xl shadow-sm border p-6">
                <div className="flex items-center gap-3 mb-6">
                  <Eye className="text-green-600" size={24} />
                  <h2 className="text-lg font-semibold text-gray-900">Join Preview</h2>
                  <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-medium">
                    {joinPreview.total_rows.toLocaleString()} rows
                  </span>
                </div>

                {/* Join Statistics */}
                {joinPreview.join_stats && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h4 className="font-medium text-gray-900 mb-2">Left Sheet</h4>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Total Rows:</span>
                          <span className="font-medium">{joinPreview.join_stats.left_rows.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h4 className="font-medium text-gray-900 mb-2">Right Sheet</h4>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Total Rows:</span>
                          <span className="font-medium">{joinPreview.join_stats.right_rows.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                    <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                      <h4 className="font-medium text-green-900 mb-2">Join Result</h4>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Joined Rows:</span>
                          <span className="text-green-600 font-medium">{joinPreview.join_stats.joined_rows.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Join Type:</span>
                          <span className="font-medium capitalize">{joinPreview.join_stats.join_type}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Sample Data Preview */}
                {joinPreview.preview_data && joinPreview.preview_data.length > 0 && joinPreview.columns ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full border border-gray-200 rounded-lg">
                      <thead className="bg-gray-50">
                        <tr>
                          {joinPreview.columns.map((header, idx) => (
                            <th key={idx} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {joinPreview.preview_data.slice(0, 5).map((row, idx) => (
                          <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            {row.map((cell, cellIdx) => (
                              <td key={cellIdx} className="px-4 py-2 text-sm text-gray-900 border-b border-gray-200">
                                {cell || '-'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 border border-gray-200 rounded-lg">
                    <p className="text-gray-600">No sample data available for preview</p>
                  </div>
                )}
              </div>
            )}

            {/* Pipeline Status */}
            {project.pipeline_status && project.pipeline_status !== 'draft' && (
              <div className="bg-white rounded-xl shadow-sm border p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Database className="text-green-600" size={24} />
                  <h2 className="text-lg font-semibold text-gray-900">Data Warehouse</h2>
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${
                      project.pipeline_status === 'completed' ? 'bg-green-500' :
                      project.pipeline_status === 'running' ? 'bg-yellow-500 animate-pulse' :
                      project.pipeline_status === 'failed' ? 'bg-red-500' : 'bg-gray-400'
                    }`}></div>
                    <span className="font-medium text-gray-900 capitalize">
                      {project.pipeline_status === 'completed' ? 'Data Ready' :
                       project.pipeline_status === 'running' ? 'Processing Data' :
                       project.pipeline_status === 'failed' ? 'Processing Failed' : 'Draft'}
                    </span>
                  </div>
                  
                  {project.last_pipeline_run && (
                    <div className="text-sm text-gray-600">
                      Last updated: {formatDate(project.last_pipeline_run)}
                    </div>
                  )}
                  
                  {project.pipeline_status === 'completed' && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <h4 className="font-medium text-green-800 mb-2">Transformed Data Available</h4>
                      <p className="text-sm text-green-700">
                        Your data has been processed and stored in the warehouse. 
                        Charts will automatically use this transformed data.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Charts Section */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <BarChart3 className="text-green-600" size={24} />
                  <h2 className="text-lg font-semibold text-gray-900">Charts ({charts.length})</h2>
                  {project.pipeline_status === 'completed' && (
                    <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-medium">
                      Live Data
                    </span>
                  )}
                  {project.pipeline_status === 'running' && (
                    <div className="flex items-center gap-2">
                      <RefreshCw size={14} className="animate-spin text-yellow-600" />
                      <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full text-xs font-medium">
                        Processing...
                      </span>
                    </div>
                  )}
                  {project.pipeline_status === 'failed' && (
                    <span className="bg-red-100 text-red-800 px-2 py-1 rounded-full text-xs font-medium">
                      Pipeline Failed
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {project.pipeline_status !== 'completed' && (
                    <div className="text-sm text-gray-600 bg-gray-100 px-3 py-2 rounded-lg">
                      {project.pipeline_status === 'draft' && 'Save configuration first'}
                      {project.pipeline_status === 'running' && 'Pipeline running...'}
                      {project.pipeline_status === 'failed' && 'Fix pipeline errors'}
                    </div>
                  )}
                  <button
                    onClick={() => router.push(`/charts?project=${project.id}`)}
                    disabled={project.pipeline_status !== 'completed'}
                    className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg flex items-center gap-2"
                    title={project.pipeline_status !== 'completed' ? 'Complete pipeline execution first' : 'Create charts from transformed data'}
                  >
                    <Plus size={16} />
                    Create New Chart
                  </button>
                </div>
              </div>

              {charts.length === 0 ? (
                <div className="text-center py-8">
                  <BarChart3 className="mx-auto text-gray-400 mb-4" size={48} />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No charts yet</h3>
                  <p className="text-gray-600 mb-4">
                    {project.pipeline_status === 'completed' 
                      ? 'Create charts from your transformed data'
                      : 'Save your transformation configuration to enable chart creation'}
                  </p>
                  {project.pipeline_status === 'completed' && (
                    <button
                      onClick={() => router.push(`/charts?project=${project.id}`)}
                      className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg"
                    >
                      Create First Chart
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {charts.map((chart) => (
                    <div key={chart.id} className="border border-gray-200 rounded-lg p-4 hover:border-green-300 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-gray-900">{chart.chart_name}</h4>
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                          {chart.chart_type}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600 mb-3">
                        X: {chart.x_axis_column} {chart.y_axis_column && `• Y: ${chart.y_axis_column}`}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => router.push(`/charts?project=${project.id}#chart-${chart.id}`)}
                          className="text-green-600 hover:text-green-700 text-sm font-medium"
                        >
                          View
                        </button>
                        <button
                          onClick={() => router.push(`/charts?project=${project.id}&edit=${chart.id}`)}
                          className="text-gray-600 hover:text-gray-700 text-sm font-medium"
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}