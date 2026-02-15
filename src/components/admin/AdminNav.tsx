'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { SessionPayload } from '@/lib/auth/session'

interface AdminNavProps {
  user: SessionPayload
}

export default function AdminNav({ user }: AdminNavProps) {
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/admin/login')
    router.refresh()
  }

  const navItems = [
    { href: '/admin', label: 'Dashboard' },
    { href: '/admin/laureats', label: 'Lauréats' },
    { href: '/admin/structures', label: 'Structures' },
    { href: '/admin/import', label: 'Import' },
  ]

  return (
    <nav className="fixed top-0 left-0 right-0 bg-white shadow-sm z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <span className="font-bold text-lg text-blue-600">API Territoires</span>
            </div>
            <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
                    pathname === item.href
                      ? 'border-blue-500 text-gray-900'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-700">{user.nom}</span>
            <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-gray-700">
              Déconnexion
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}
