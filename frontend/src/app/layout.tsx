import './globals.css'
import type { Metadata } from 'next'
import { AuthProvider } from '@/contexts/AuthContext'
import { Anek_Latin } from 'next/font/google'

const anekLatin = Anek_Latin({
  subsets: ['latin'],
  display: 'swap',
})
import { SidebarProvider } from '@/contexts/SidebarContext'

export const metadata: Metadata = {
  title: 'Dalgo - Smart Data Analytics',
  description: 'Visual data transformation and AI-powered analytics platform for survey and qualitative data - A Project Tech4Dev Initiative',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`bg-gray-50 ${anekLatin.className}`}>
        <AuthProvider>
          <SidebarProvider>
            {children}
          </SidebarProvider>
        </AuthProvider>
      </body>
    </html>
  )
}