'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Econome {
  id: string
  nom: string
  prenom: string | null
  email: string
  telephone: string | null
  statut: string
  reseau: string | null
  structure?: { id: string; nom: string; type: string }
  region?: { nom: string }
  departement?: { nom: string }
}

interface Pagination {
  page: number
  limit: number
  total: number
  pages: number
}

export default function EconomesPage() {
  const [economes, setEconomes] = useState<Econome[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    page: 1,
    q: '',
    statut: '',
    reseau: '',
  })

  const fetchEconomes = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', filters.page.toString())
      params.set('limit', '20')
      if (filters.q) params.set('q', filters.q)
      if (filters.statut) params.set('statut', filters.statut)
      if (filters.reseau) params.set('reseau', filters.reseau)

      const res = await fetch(`/api/v1/economes?${params}`)
      const data = await res.json()
      setEconomes(data.economes || [])
      setPagination(data.pagination)
    } catch (error) {
      console.error('Error fetching economes:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEconomes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.page, filters.statut, filters.reseau])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setFilters({ ...filters, page: 1 })
    fetchEconomes()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cet économe ?')) return

    try {
      await fetch(`/api/v1/economes/${id}`, { method: 'DELETE' })
      fetchEconomes()
    } catch (error) {
      console.error('Error deleting econome:', error)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Économes de Flux</h1>
        <Link href="/admin/economes/new" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
          Ajouter
        </Link>
      </div>

      {/* Filtres */}
      <form onSubmit={handleSearch} className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <input
              type="text"
              placeholder="Rechercher nom, prénom, email..."
              value={filters.q}
              onChange={(e) => setFilters({ ...filters, q: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          <div>
            <select
              value={filters.statut}
              onChange={(e) => setFilters({ ...filters, statut: e.target.value, page: 1 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">Tous les statuts</option>
              <option value="ACTIF">Actif</option>
              <option value="INACTIF">Inactif</option>
              <option value="EN_FORMATION">En formation</option>
            </select>
          </div>
          <div>
            <select
              value={filters.reseau}
              onChange={(e) => setFilters({ ...filters, reseau: e.target.value, page: 1 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">Tous les réseaux</option>
              <option value="FNCCR">FNCCR</option>
              <option value="AMORCE">AMORCE</option>
              <option value="AUTRE">Autre</option>
            </select>
          </div>
          <div>
            <button type="submit" className="w-full px-4 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-900">
              Rechercher
            </button>
          </div>
        </div>
      </form>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nom</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Structure
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Statut</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Réseau</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Territoire
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                  Chargement...
                </td>
              </tr>
            ) : economes.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                  Aucun économe trouvé
                </td>
              </tr>
            ) : (
              economes.map((econome) => (
                <tr key={econome.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {econome.prenom} {econome.nom}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{econome.email}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{econome.structure?.nom || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        econome.statut === 'ACTIF'
                          ? 'bg-green-100 text-green-800'
                          : econome.statut === 'EN_FORMATION'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {econome.statut}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{econome.reseau || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {econome.departement?.nom || econome.region?.nom || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <Link href={`/admin/economes/${econome.id}`} className="text-blue-600 hover:text-blue-900 mr-4">
                      Modifier
                    </Link>
                    <button onClick={() => handleDelete(econome.id)} className="text-red-600 hover:text-red-900">
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {pagination && pagination.pages > 1 && (
          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200">
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  Page <span className="font-medium">{pagination.page}</span> sur{' '}
                  <span className="font-medium">{pagination.pages}</span> ({pagination.total} résultats)
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
                  disabled={filters.page <= 1}
                  className="px-3 py-1 border rounded-md disabled:opacity-50"
                >
                  Précédent
                </button>
                <button
                  onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
                  disabled={filters.page >= pagination.pages}
                  className="px-3 py-1 border rounded-md disabled:opacity-50"
                >
                  Suivant
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
