import { getSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import AdminNav from '@/components/admin/AdminNav'

export const metadata = {
  title: 'Admin - API Territoires',
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()

  // La page login est publique
  const isLoginPage = typeof window !== 'undefined' && window.location.pathname === '/admin/login'

  if (!session && !isLoginPage) {
    // Le middleware gère la redirection, mais on garde ça comme fallback
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {session && <AdminNav user={session} />}
      <main className={session ? 'pt-16' : ''}>{children}</main>
    </div>
  )
}
