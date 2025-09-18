'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { GitMerge, ArrowRight, Zap, Database, Plus, Calendar, Eye, CheckCircle } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { getApiUrl } from '@/lib/config'

interface ProgressRibbonProps {
  currentStep: number
  totalSteps: number
}

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

function ProgressRibbon({ currentStep, totalSteps }: ProgressRibbonProps) {
  const steps = ['Connect Data', 'Transform', 'Visualize']

  return (
    <div className="bg-white border-b border-gray-200 py-6">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-medium text-gray-900">Onboarding Progress</h2>
          <span className="text-base text-gray-500">{currentStep} of {totalSteps}</span>
        </div>
        <div className="w-full">
          <div className="flex items-center justify-center">
            {Array.from({ length: totalSteps }, (_, i) => (
              <div key={i} className="flex-1 flex flex-col items-center">
                <div className="flex items-center w-full">
                  <div className="flex-1 flex items-center">
                    <div
                      className={`h-3 w-full rounded-full ${
                        i + 1 <= currentStep
                          ? 'bg-blue-600'
                          : i + 1 === currentStep
                            ? 'bg-blue-300'
                            : 'bg-gray-200'
                      }`}
                    />
                    {i < totalSteps - 1 && (
                      <ArrowRight
                        className={`mx-3 h-5 w-5 flex-shrink-0 ${
                          i + 1 < currentStep ? 'text-blue-600' : 'text-gray-300'
                        }`}
                      />
                    )}
                  </div>
                </div>
                <span className="mt-3 text-sm text-gray-600 font-medium">{steps[i]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Onboarding2Page() {
  const { isAuthenticated } = useAuth()
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
    if (isAuthenticated) {
      fetchData()
    }
  }, [isAuthenticated])

  const fetchData = async () => {
    try {
      setLoading(true)

      // Fetch connected sheets
      const sheetsResponse = await fetch(getApiUrl('/sheets/connected'))
      if (sheetsResponse.ok) {
        const sheetsData = await sheetsResponse.json()
        setSheets(sheetsData.sheets || [])
      }

      // Fetch transformation projects
      const projectsResponse = await fetch(getApiUrl('/projects'))
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
      const response = await fetch(getApiUrl('/projects'), {
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
        // Redirect to the canvas page for the new project with onboarding parameter
        router.push(`/transform/${newProject.id}/canvas?from=onboarding`)
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

  return (
    <div className="min-h-screen bg-gray-50">
      <ProgressRibbon currentStep={2} totalSteps={3} />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <div className="flex justify-center mb-6">
            <div className="bg-green-100 rounded-full p-6">
              <GitMerge className="text-green-600" size={48} />
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Step 2: Transform & Combine Data
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Now let's transform your data and combine multiple sources to create powerful datasets for analysis.
          </p>
        </div>

        {/* Existing Projects */}
        {!loading && projects.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border p-8 mb-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Your Transform Projects</h2>
              <button
                onClick={() => router.push('/onboarding/onboarding_3')}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg inline-flex items-center gap-2 transition-colors"
              >
                Continue to Next Step
                <ArrowRight size={20} />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {projects.map((project) => (
                <div key={project.id} className="bg-gray-50 rounded-xl border border-gray-200 p-6">
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
                      onClick={() => router.push(`/transform/${project.id}/canvas?from=onboarding`)}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg font-medium transition-colors text-sm"
                    >
                      Open Canvas
                    </button>
                    <button
                      onClick={() => router.push(`/transform/${project.id}/canvas?from=onboarding`)}
                      className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-lg font-medium transition-colors text-sm"
                      title="View canvas"
                    >
                      <Eye size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">Build Your Data Pipeline</h2>
              <p className="text-gray-600 mb-8">
                Use our visual pipeline builder to transform, filter, and combine your data sources.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-purple-50 rounded-lg p-6">
                <div className="flex items-center gap-3 mb-3">
                  <Zap className="text-purple-600" size={24} />
                  <h3 className="text-lg font-medium text-purple-900">AI-Powered Transformations</h3>
                </div>
                <ul className="space-y-2 text-purple-800 text-sm">
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-purple-600 rounded-full mt-2"></div>
                    <span>Let AI suggest optimal transformations</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-purple-600 rounded-full mt-2"></div>
                    <span>Clean and standardize your data automatically</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-purple-600 rounded-full mt-2"></div>
                    <span>Generate calculated fields and formulas</span>
                  </li>
                </ul>
              </div>

              <div className="bg-blue-50 rounded-lg p-6">
                <div className="flex items-center gap-3 mb-3">
                  <Database className="text-blue-600" size={24} />
                  <h3 className="text-lg font-medium text-blue-900">Data Combination</h3>
                </div>
                <ul className="space-y-2 text-blue-800 text-sm">
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-2"></div>
                    <span>Join multiple sheets and data sources</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-2"></div>
                    <span>Merge similar datasets seamlessly</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-2"></div>
                    <span>Create unified views of your data</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-3">What you'll accomplish:</h3>
              <ul className="space-y-2 text-gray-700">
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-gray-600 rounded-full mt-2"></div>
                  <span>Create your first transformation project</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-gray-600 rounded-full mt-2"></div>
                  <span>Learn to use the visual transformation builder</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-gray-600 rounded-full mt-2"></div>
                  <span>Apply AI-powered transformations to your data</span>
                </li>
              </ul>
            </div>

            <div className="flex justify-center pt-6">
              {loading ? (
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-2"></div>
                  <p className="text-gray-600">Loading...</p>
                </div>
              ) : sheets.length === 0 ? (
                <div className="text-center">
                  <p className="text-amber-600 mb-4">You need to connect at least one sheet first.</p>
                  <button
                    onClick={() => router.push('/onboarding/onboarding_1')}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg inline-flex items-center gap-2 transition-colors"
                  >
                    Go Back to Connect Sheets
                  </button>
                </div>
              ) : (
                <div className="flex gap-4">
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-8 rounded-lg inline-flex items-center gap-2 transition-colors"
                  >
                    <GitMerge size={20} />
                    Start Transforming
                  </button>
                  <button
                    onClick={() => router.push('/onboarding/onboarding_3')}
                    className="bg-gray-600 hover:bg-gray-700 text-white font-semibold py-3 px-8 rounded-lg inline-flex items-center gap-2 transition-colors"
                  >
                    <ArrowRight size={20} />
                    Skip to Visualization
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500">
            Don't worry, all transformations are reversible and non-destructive!
          </p>
        </div>
      </main>

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
    </div>
  )
}