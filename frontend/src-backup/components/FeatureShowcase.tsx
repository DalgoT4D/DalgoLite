import { SheetIcon, Zap, BarChart3, TrendingUp, Users, Globe } from 'lucide-react'

export default function FeatureShowcase() {
  const features = [
    {
      icon: SheetIcon,
      title: "Connect Google Sheets",
      description: "Seamlessly sync with your existing Google Sheets data in seconds",
      color: "text-green-600"
    },
    {
      icon: Zap,
      title: "Instant Analysis",
      description: "AI-powered recommendations suggest the best charts for your data patterns",
      color: "text-yellow-600"
    },
    {
      icon: BarChart3,
      title: "Beautiful Charts",
      description: "Create professional visualizations that tell your impact story",
      color: "text-blue-600"
    }
  ]

  const useCases = [
    {
      icon: Users,
      title: "Program Impact",
      description: "Track beneficiaries, outcomes, and program effectiveness across all your initiatives"
    },
    {
      icon: TrendingUp,
      title: "Donation Trends",
      description: "Visualize funding patterns, donor engagement, and campaign performance"
    },
    {
      icon: Globe,
      title: "Community Reach",
      description: "Map your geographical impact and community engagement metrics"
    }
  ]

  return (
    <div className="py-16 bg-white">
      <div className="container mx-auto px-4">
        {/* How it works */}
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Transform Your NGO Data in 3 Simple Steps
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            No technical expertise required. Start creating impactful visualizations in minutes.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mb-20">
          {features.map((feature, index) => (
            <div key={index} className="text-center group">
              <div className="relative mb-6">
                <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto group-hover:bg-gray-100 transition-colors duration-300">
                  <feature.icon className={`w-8 h-8 ${feature.color}`} />
                </div>
                <div className="absolute -top-2 -right-2 bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold">
                  {index + 1}
                </div>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">{feature.title}</h3>
              <p className="text-gray-600 leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>

        {/* Use cases */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-100 rounded-2xl p-8 md:p-12">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Perfect for NGO Impact Reporting
            </h2>
            <p className="text-xl text-gray-600">
              Showcase your mission with data-driven stories that inspire donors and stakeholders
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {useCases.map((useCase, index) => (
              <div key={index} className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow duration-300">
                <useCase.icon className="w-8 h-8 text-blue-600 mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{useCase.title}</h3>
                <p className="text-gray-600">{useCase.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}