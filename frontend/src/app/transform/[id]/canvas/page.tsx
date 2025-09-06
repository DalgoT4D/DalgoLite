'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Save, Play, Settings, AlertCircle } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import DashboardLayout from '@/components/DashboardLayout'
import TransformCanvas from '@/components/TransformCanvas'

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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
      const projectResponse = await fetch(`http://localhost:8000/projects/${projectId}`)
      if (!projectResponse.ok) {
        throw new Error('Project not found')
      }
      const projectData = await projectResponse.json()
      setProject(projectData)

      // Fetch project sheets
      const sheetsResponse = await fetch(`http://localhost:8000/sheets/connected`)
      if (sheetsResponse.ok) {
        const allSheets = await sheetsResponse.json()
        // Filter sheets that belong to this project
        const projectSheets = allSheets.sheets.filter((sheet: ConnectedSheet) => 
          projectData.sheet_ids.includes(sheet.id)
        )
        setSheets(projectSheets)
      }

      // Fetch transformation steps
      const stepsResponse = await fetch(`http://localhost:8000/projects/${projectId}/ai-transformations`)
      if (stepsResponse.ok) {
        const stepsData = await stepsResponse.json()
        setTransformationSteps(stepsData.steps)
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
      const response = await fetch(`http://localhost:8000/projects/${projectId}/ai-transformations`, {
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
      const response = await fetch(`http://localhost:8000/ai-transformations/${stepId}`, {
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
      if (!updates.user_prompt && !updates.step_name) {
        // For canvas position updates, don't refresh everything
        return
      }

      // Only refresh transformation steps for meaningful changes
      const stepsResponse = await fetch(`http://localhost:8000/projects/${projectId}/ai-transformations`)
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
      const response = await fetch(`http://localhost:8000/ai-transformations/${stepId}/execute`, {
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
      const stepsResponse = await fetch(`http://localhost:8000/projects/${projectId}/ai-transformations`)
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
      const response = await fetch(`http://localhost:8000/projects/${projectId}/execute-all`, {
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
      alert(`✅ ${result.message}\n\nExecuted: ${result.executed_steps?.length || 0} steps\nFailed: ${result.failed_steps?.length || 0} steps`)

      // Only refresh transformation steps, not entire project data
      const stepsResponse = await fetch(`http://localhost:8000/projects/${projectId}/ai-transformations`)
      if (stepsResponse.ok) {
        const stepsData = await stepsResponse.json()
        setTransformationSteps(stepsData.steps)
      }
    } catch (err) {
      console.error('Error executing all transformations:', err)
      alert(err instanceof Error ? err.message : 'Failed to execute all transformations')
    }
  }

  const handleDeleteTransformationStep = async (stepId: number) => {
    try {
      const response = await fetch(`http://localhost:8000/ai-transformations/${stepId}`, {
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
      const stepsResponse = await fetch(`http://localhost:8000/projects/${projectId}/ai-transformations`)
      if (stepsResponse.ok) {
        const stepsData = await stepsResponse.json()
        setTransformationSteps(stepsData.steps)
      }
    } catch (err) {
      console.error('Error deleting transformation step:', err)
      throw err // Re-throw to be handled by the caller
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
            </div>
          </div>
        </div>
      </header>

      {/* Full-screen Canvas */}
      <div className="bg-white" style={{height: 'calc(100vh - 80px)'}}>
        <TransformCanvas
          projectId={projectId}
          sheets={sheets}
          transformationSteps={transformationSteps}
          onCreateTransformationStep={handleCreateTransformationStep}
          onUpdateTransformationStep={handleUpdateTransformationStep}
          onExecuteStep={handleExecuteStep}
          onExecuteAll={handleExecuteAll}
          onDeleteTransformationStep={handleDeleteTransformationStep}
        />
      </div>
    </div>
  )
}