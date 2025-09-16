'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Save, Play, Settings, AlertCircle, Clock, X } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import DashboardLayout from '@/components/DashboardLayout'
import TransformCanvas from '@/components/TransformCanvas'
import AutomationPanel from '@/components/AutomationPanel'
import { getApiUrl, API_ENDPOINTS } from '@/lib/config'

interface ConnectedSheet {
  id: number
  title: string
  columns: string[]
  total_rows: number
}

interface TransformationStep {
  id: number
  step_name: string
  user_prompt: string
  generated_code: string
  code_summary: string
  code_explanation: string
  input_columns: string[]
  output_columns: string[]
  upstream_step_ids: number[]
  upstream_sheet_ids: number[]
  canvas_position: { x: number; y: number }
  execution_order: number
  status: 'draft' | 'ready' | 'running' | 'completed' | 'failed'
  error_message?: string
  last_executed?: string
  execution_time_ms?: number
  created_at: string
  updated_at: string
}

interface TransformationProject {
  id: number
  name: string
  description: string
  sheet_ids: number[]
  canvas_layout?: any
  created_at: string
  updated_at: string
}

export default function ProjectCanvasPage() {
  const { isAuthenticated, logout } = useAuth()
  const router = useRouter()
  const params = useParams()
  const projectId = parseInt(params.id as string)

  const [project, setProject] = useState<TransformationProject | null>(null)
  const [sheets, setSheets] = useState<ConnectedSheet[]>([])
  const [transformationSteps, setTransformationSteps] = useState<TransformationStep[]>([])
  const [joins, setJoins] = useState<any[]>([])
  const [qualitativeDataOperations, setQualitativeDataOperations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAutomation, setShowAutomation] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/')
      return
    }
    fetchProjectData()
  }, [isAuthenticated, router, projectId])

  const fetchProjectData = async () => {
    try {
      setLoading(true)
      
      // Fetch project details
      const projectResponse = await fetch(getApiUrl(`/projects/${projectId}`))
      if (!projectResponse.ok) {
        throw new Error('Project not found')
      }
      const projectData = await projectResponse.json()
      setProject(projectData)

      // Fetch project sheets
      const sheetsResponse = await fetch(getApiUrl(`/sheets/connected`))
      if (sheetsResponse.ok) {
        const allSheets = await sheetsResponse.json()
        // Filter sheets that belong to this project
        const projectSheets = allSheets.sheets.filter((sheet: ConnectedSheet) => 
          projectData.sheet_ids.includes(sheet.id)
        )
        setSheets(projectSheets)
      }

      // Fetch transformation steps
      const stepsResponse = await fetch(getApiUrl(`/projects/${projectId}/ai-transformations`))
      if (stepsResponse.ok) {
        const stepsData = await stepsResponse.json()
        setTransformationSteps(stepsData.steps)
      }

      // Fetch joins  
      const joinsResponse = await fetch(getApiUrl(`/projects/${projectId}/joins`))
      if (joinsResponse.ok) {
        const joinsData = await joinsResponse.json()
        setJoins(joinsData.joins || [])
      }

      // Fetch qualitative data operations
      const qualitativeResponse = await fetch(getApiUrl(`/projects/${projectId}/qualitative-data`))
      if (qualitativeResponse.ok) {
        const qualitativeData = await qualitativeResponse.json()
        setQualitativeDataOperations(qualitativeData.operations || [])
      }

    } catch (err) {
      console.error('Error fetching project data:', err)
      setError(err instanceof Error ? err.message : 'Failed to load project')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateTransformationStep = async (stepData: {
    step_name: string
    user_prompt: string
    output_table_name?: string
    upstream_sheet_ids: number[]
    upstream_step_ids: number[]
    canvas_position: { x: number; y: number }
  }) => {
    try {
      const response = await fetch(getApiUrl(`/projects/${projectId}/ai-transformations`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          project_id: projectId,
          ...stepData
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to create transformation step')
      }

      // Refresh transformation steps
      await fetchProjectData()
    } catch (err) {
      console.error('Error creating transformation step:', err)
      alert(err instanceof Error ? err.message : 'Failed to create transformation step')
    }
  }

  const handleUpdateTransformationStep = async (stepId: number, updates: any) => {
    try {
      const response = await fetch(getApiUrl(`/ai-transformations/${stepId}`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to update transformation step')
      }

      // Update local state instead of full refresh for minor updates
      if (!updates.user_prompt && !updates.step_name && !updates.output_table_name) {
        // For canvas position updates, don't refresh everything
        return
      }

      // Only refresh transformation steps for meaningful changes
      const stepsResponse = await fetch(getApiUrl(`/projects/${projectId}/ai-transformations`))
      if (stepsResponse.ok) {
        const stepsData = await stepsResponse.json()
        setTransformationSteps(stepsData.steps)
      }
    } catch (err) {
      console.error('Error updating transformation step:', err)
      alert(err instanceof Error ? err.message : 'Failed to update transformation step')
    }
  }

  const handleExecuteStep = async (stepId: number) => {
    try {
      const response = await fetch(getApiUrl(`/ai-transformations/${stepId}/execute`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to execute transformation step')
      }

      // Only refresh transformation steps, not entire project data
      const stepsResponse = await fetch(getApiUrl(`/projects/${projectId}/ai-transformations`))
      if (stepsResponse.ok) {
        const stepsData = await stepsResponse.json()
        setTransformationSteps(stepsData.steps)
      }
    } catch (err) {
      console.error('Error executing transformation step:', err)
      alert(err instanceof Error ? err.message : 'Failed to execute transformation step')
    }
  }

  const handleExecuteAll = async () => {
    try {
      const response = await fetch(getApiUrl(`/projects/${projectId}/execute-all`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to execute all transformations')
      }

      const result = await response.json()
      
      // Show success message
      alert(`✅ ${result.message}\n\nExecuted: ${result.executed_steps?.length || 0} operations\nFailed: ${result.failed_steps?.length || 0} operations`)

      // Refresh both transformation steps and joins
      await fetchProjectData()
    } catch (err) {
      console.error('Error executing all transformations:', err)
      alert(err instanceof Error ? err.message : 'Failed to execute all transformations')
    }
  }

  const handleDeleteTransformationStep = async (stepId: number) => {
    try {
      const response = await fetch(getApiUrl(`/ai-transformations/${stepId}`), {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to delete transformation step')
      }

      // Refresh transformation steps
      const stepsResponse = await fetch(getApiUrl(`/projects/${projectId}/ai-transformations`))
      if (stepsResponse.ok) {
        const stepsData = await stepsResponse.json()
        setTransformationSteps(stepsData.steps)
      }
    } catch (err) {
      console.error('Error deleting transformation step:', err)
      throw err // Re-throw to be handled by the caller
    }
  }

  const handleTransformationCreated = async () => {
    try {
      // Refresh transformation steps
      const transformationResponse = await fetch(getApiUrl(`/projects/${projectId}/transformation-steps`))
      if (transformationResponse.ok) {
        const transformationData = await transformationResponse.json()
        setTransformationSteps(transformationData.steps || [])
      }
    } catch (err) {
      console.error('Error refreshing transformation steps:', err)
    }
  }

  const handleQualitativeDataCreated = async () => {
    try {
      // Refresh qualitative data operations
      const qualitativeResponse = await fetch(getApiUrl(`/projects/${projectId}/qualitative-data`))
      if (qualitativeResponse.ok) {
        const qualitativeData = await qualitativeResponse.json()
        setQualitativeDataOperations(qualitativeData.operations || [])
      }
    } catch (err) {
      console.error('Error refreshing qualitative data operations:', err)
    }
  }

  if (loading) {
    return (
      <DashboardLayout isAuthenticated={isAuthenticated} onLogout={logout}>
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading project canvas...</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (error || !project) {
    return (
      <DashboardLayout isAuthenticated={isAuthenticated} onLogout={logout}>
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="text-red-600 mb-4">
              <AlertCircle className="mx-auto mb-2" size={48} />
              <h2 className="text-xl font-semibold">Error Loading Project</h2>
            </div>
            <p className="text-gray-600 mb-4">{error}</p>
            <button
              onClick={() => router.push('/home')}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Full-width header merged with main layout */}
      <header className="bg-white shadow-sm border-b sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/home')}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900 font-medium"
              >
                <ArrowLeft size={20} />
                Back to Dashboard
              </button>
              <div className="h-6 w-px bg-gray-300"></div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">{project.name}</h1>
                <p className="text-sm text-gray-600">{project.description}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-sm text-gray-600">
                {sheets.length} sheets • {transformationSteps.length} transforms
              </div>
              <button
                onClick={() => setShowAutomation(!showAutomation)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                  showAutomation 
                    ? 'bg-purple-50 border-purple-300 text-purple-700' 
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Clock size={16} />
                Automation
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area with Canvas and Sidebar */}
      <div className="relative bg-white" style={{height: 'calc(100vh - 80px)'}}>
        {/* Canvas */}
        <div className={`transition-all duration-300 ${showAutomation ? 'pr-80' : ''}`} style={{height: '100%'}}>
          <TransformCanvas
            projectId={projectId}
            sheets={sheets}
            transformationSteps={transformationSteps}
            joins={joins}
            qualitativeDataOperations={qualitativeDataOperations}
            onCreateTransformationStep={handleCreateTransformationStep}
            onUpdateTransformationStep={handleUpdateTransformationStep}
            onExecuteStep={handleExecuteStep}
            onExecuteAll={handleExecuteAll}
            onDeleteTransformationStep={handleDeleteTransformationStep}
            onTransformationCreated={handleTransformationCreated}
            onQualitativeDataCreated={handleQualitativeDataCreated}
          />
        </div>

        {/* Automation Sidebar */}
        {showAutomation && (
          <div className="fixed right-0 top-20 w-80 h-full bg-gray-50 border-l border-gray-200 overflow-y-auto z-30 transition-transform duration-300">
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Project Automation</h2>
                <button
                  onClick={() => setShowAutomation(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <AutomationPanel 
                projectId={projectId} 
                projectName={project?.name || ''} 
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}