import { prisma } from '@/lib/prisma'
import Link from 'next/link'

export default async function AdminDashboard() {
  // Statistiques
  const [totalLaureats, totalEconomes, totalStructures, laureatsParStatut, economesParStatut, structuresParType] =
    await Promise.all([
      prisma.laureat.count(),
      prisma.economeFlux.count(),
      prisma.structure.count(),
      prisma.laureat.groupBy({
        by: ['statut'],
        _count: true,
      }),
      prisma.economeFlux.groupBy({
        by: ['statut'],
        _count: true,
      }),
      prisma.structure.groupBy({
        by: ['type'],
        _count: true,
        orderBy: { _count: { type: 'desc' } },
        take: 10,
      }),
    ])

  const stats = [
    {
      label: 'Lauréats',
      value: totalLaureats,
      href: '/admin/laureats',
      color: 'bg-blue-500',
    },
    {
      label: 'Économes de Flux',
      value: totalEconomes,
      href: '/admin/economes',
      color: 'bg-green-500',
    },
    {
      label: 'Structures',
      value: totalStructures,
      href: '/admin/structures',
      color: 'bg-purple-500',
    },
  ]

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Dashboard</h1>

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center">
              <div className={`w-12 h-12 ${stat.color} rounded-lg flex items-center justify-center`}>
                <span className="text-white text-xl font-bold">{stat.value}</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Total</p>
                <p className="text-lg font-semibold text-gray-900">{stat.label}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Détails */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Lauréats par statut */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Lauréats par statut</h2>
          <ul className="space-y-2">
            {laureatsParStatut.map((item) => (
              <li key={item.statut} className="flex justify-between">
                <span className="text-gray-600">{item.statut}</span>
                <span className="font-medium">{item._count}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Économes par statut */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Économes par statut</h2>
          <ul className="space-y-2">
            {economesParStatut.map((item) => (
              <li key={item.statut} className="flex justify-between">
                <span className="text-gray-600">{item.statut}</span>
                <span className="font-medium">{item._count}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Top structures par type */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Structures par type</h2>
          <ul className="space-y-2">
            {structuresParType.map((item) => (
              <li key={item.type} className="flex justify-between">
                <span className="text-gray-600 text-sm">{item.type}</span>
                <span className="font-medium">{item._count}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Actions rapides */}
      <div className="mt-8 bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Actions rapides</h2>
        <div className="flex flex-wrap gap-4">
          <Link href="/admin/import" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
            Importer des données
          </Link>
          <Link
            href="/admin/laureats?action=new"
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            Ajouter un lauréat
          </Link>
          <Link
            href="/admin/economes?action=new"
            className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
          >
            Ajouter un économe
          </Link>
        </div>
      </div>
    </div>
  )
}
