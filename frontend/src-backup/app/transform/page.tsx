'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Database, Zap, Users, Eye, Calendar, Play, CheckCircle } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import DashboardLayout from '@/components/DashboardLayout'

interface ConnectedSheet {
  id: number
  title: string
  sheet_name: string
  total_rows: number
  columns: string[]
  sample_data: string[][]
}

interface TransformationProject {
  id: number
  name: string
  description: string
  sheet_ids: number[]
  created_at: string
  updated_at: string
}

export default function TransformPage() {
  const { isAuthenticated, logout } = useAuth()
  const router = useRouter()
  const [sheets, setSheets] = useState<ConnectedSheet[]>([])
  const [projects, setProjects] = useState<TransformationProject[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectDescription, setNewProjectDescription] = useState('')
  const [selectedSheets, setSelectedSheets] = useState<number[]>([])
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/')
      return
    }
    fetchData()
  }, [isAuthenticated, router])

  const fetchData = async () => {
    try {
      setLoading(true)
      
      // Fetch connected sheets
      const sheetsResponse = await fetch('http://localhost:8005/sheets/connected')
      if (sheetsResponse.ok) {
        const sheetsData = await sheetsResponse.json()
        setSheets(sheetsData.sheets || [])
      }

      // Fetch transformation projects
      const projectsResponse = await fetch('http://localhost:8005/projects')
      if (projectsResponse.ok) {
        const projectsData = await projectsResponse.json()
        setProjects(projectsData.projects || [])
      }

    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateProject = async () => {
    if (!newProjectName.trim() || selectedSheets.length === 0) return
    
    try {
      setCreating(true)
      const response = await fetch('http://localhost:8005/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newProjectName,
          description: newProjectDescription || `Transform project with ${selectedSheets.length} sheets`,
          sheet_ids: selectedSheets
        }),
      })

      if (response.ok) {
        const newProject = await response.json()
        // Redirect to the canvas page for the new project
        router.push(`/transform/${newProject.id}/canvas`)
      } else {
        const errorData = await response.json()
        alert(`Error creating project: ${errorData.detail}`)
      }
    } catch (error) {
      console.error('Error creating project:', error)
      alert('Failed to create project. Please try again.')
    } finally {
      setCreating(false)
    }
  }

  const handleSheetSelection = (sheetId: number) => {
    setSelectedSheets(prev => 
      prev.includes(sheetId)
        ? prev.filter(id => id !== sheetId)
        : [...prev, sheetId]
    )
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString()
  }

  if (loading) {
    return (
      <DashboardLayout isAuthenticated={isAuthenticated} onLogout={logout}>
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading transformation projects...</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout isAuthenticated={isAuthenticated} onLogout={logout}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/home')}
            className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium mb-4"
          >
            <ArrowLeft size={20} />
            Back to Dashboard
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">AI Transform Projects</h1>
              <p className="text-lg text-gray-600">
                Create visual transformation pipelines using natural language AI
              </p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              disabled={sheets.length === 0}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all duration-200 shadow-lg ${
                sheets.length === 0 
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                  : 'bg-gradient-to-r from-green-600 to-emerald-700 hover:from-green-700 hover:to-emerald-800 text-white hover:shadow-xl transform hover:scale-105'
              }`}
              title={sheets.length === 0 ? 'Connect at least one sheet first' : 'Create a new transformation project'}
            >
              <Plus size={20} />
              New Transform Project
            </button>
          </div>
        </div>

        {/* Projects Grid */}
        {projects.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {projects.map((project) => (
              <div key={project.id} className="bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-lg transition-all duration-200">
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="bg-green-100 p-2 rounded-lg">
                      <Zap className="text-green-600" size={24} />
                    </div>
                    <span className="text-xs text-gray-500">{project.sheet_ids.length} sheets</span>
                  </div>
                  
                  <h3 className="font-semibold text-gray-900 mb-2">{project.name}</h3>
                  <p className="text-sm text-gray-600 mb-4 line-clamp-2">{project.description}</p>
                  
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-4">
                    <div className="flex items-center gap-1">
                      <Calendar size={12} />
                      <span>Created {formatDate(project.created_at)}</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => router.push(`/transform/${project.id}/canvas`)}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg font-medium transition-colors text-sm"
                    >
                      Open Canvas
                    </button>
                    <button
                      onClick={() => router.push(`/transform/${project.id}/canvas`)}
                      className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-lg font-medium transition-colors text-sm"
                      title="View canvas"
                    >
                      <Eye size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 mb-12">
            <div className="bg-gradient-to-br from-green-100 to-emerald-100 rounded-full p-6 w-24 h-24 mx-auto mb-6">
              <Zap className="mx-auto h-12 w-12 text-green-600" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-3">Create Your First Transform Project</h3>
            <p className="text-gray-600 mb-8 text-lg max-w-md mx-auto">
              Build visual transformation pipelines with AI-powered steps that understand natural language.
            </p>
            {sheets.length === 0 ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 max-w-md mx-auto mb-6">
                <p className="text-yellow-800 text-sm">
                  You need to connect at least one Google Sheet before creating a transformation project.
                </p>
                <button
                  onClick={() => router.push('/dashboard')}
                  className="mt-2 text-yellow-700 hover:text-yellow-900 font-medium underline"
                >
                  Connect your first sheet
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowCreateModal(true)}
                className="bg-gradient-to-r from-green-600 to-emerald-700 hover:from-green-700 hover:to-emerald-800 text-white px-8 py-4 rounded-xl font-semibold inline-flex items-center gap-3 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 text-lg"
              >
                <Plus size={24} />
                Create Transform Project
              </button>
            )}
          </div>
        )}

        {/* Available Sheets */}
        {sheets.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Available Sheets ({sheets.length})</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sheets.map((sheet) => (
                <div key={sheet.id} className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
                  <div className="flex items-center gap-3 mb-2">
                    <Database size={16} className="text-blue-600" />
                    <h3 className="font-medium text-gray-900 truncate">{sheet.title}</h3>
                  </div>
                  <div className="text-sm text-gray-600">
                    {sheet.total_rows.toLocaleString()} rows • {sheet.columns.length} columns
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {sheet.columns.slice(0, 3).map((col, idx) => (
                      <span key={idx} className="text-xs bg-gray-100 px-2 py-1 rounded">
                        {col}
                      </span>
                    ))}
                    {sheet.columns.length > 3 && (
                      <span className="text-xs text-gray-500">+{sheet.columns.length - 3}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Create Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Zap className="text-green-600" size={20} />
              Create Transform Project
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Project Name
                </label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="e.g., Sales Data Analysis, Customer Segmentation"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description (Optional)
                </label>
                <textarea
                  value={newProjectDescription}
                  onChange={(e) => setNewProjectDescription(e.target.value)}
                  placeholder="Describe what this transformation project will accomplish..."
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Sheets to Include
                </label>
                <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
                  {sheets.map((sheet) => (
                    <div
                      key={sheet.id}
                      onClick={() => handleSheetSelection(sheet.id)}
                      className={`p-3 cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors ${
                        selectedSheets.includes(sheet.id)
                          ? 'bg-green-50 border-green-200'
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                          selectedSheets.includes(sheet.id)
                            ? 'border-green-500 bg-green-500'
                            : 'border-gray-300'
                        }`}>
                          {selectedSheets.includes(sheet.id) && (
                            <CheckCircle className="text-white" size={12} />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">{sheet.title}</div>
                          <div className="text-sm text-gray-500">
                            {sheet.total_rows} rows, {sheet.columns.length} columns
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {selectedSheets.length === 0 && (
                <div className="text-sm text-amber-600 bg-amber-50 p-2 rounded">
                  Please select at least one sheet to include in your project.
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setShowCreateModal(false)
                  setNewProjectName('')
                  setNewProjectDescription('')
                  setSelectedSheets([])
                }}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateProject}
                disabled={!newProjectName.trim() || selectedSheets.length === 0 || creating}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-lg font-medium transition-colors"
              >
                {creating ? 'Creating...' : 'Create & Open Canvas'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}