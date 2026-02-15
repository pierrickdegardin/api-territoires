'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Laureat {
  id: string
  nom: string
  type: string | null
  statut: string
  source: string
  regionCode: string | null
  departementCode: string | null
  region?: { nom: string }
  departement?: { nom: string }
  coutTotal: number | null
  createdAt: string
}

interface Pagination {
  page: number
  limit: number
  total: number
  pages: number
}

export default function LaureatsPage() {
  const [laureats, setLaureats] = useState<Laureat[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    page: 1,
    q: '',
    statut: '',
    source: '',
  })

  const fetchLaureats = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', filters.page.toString())
      params.set('limit', '20')
      if (filters.q) params.set('q', filters.q)
      if (filters.statut) params.set('statut', filters.statut)
      if (filters.source) params.set('source', filters.source)

      const res = await fetch(`/api/v1/laureats?${params}`)
      const data = await res.json()
      setLaureats(data.laureats || [])
      setPagination(data.pagination)
    } catch (error) {
      console.error('Error fetching laureats:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLaureats()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.page, filters.statut, filters.source])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setFilters({ ...filters, page: 1 })
    fetchLaureats()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce lauréat ?')) return

    try {
      await fetch(`/api/v1/laureats/${id}`, { method: 'DELETE' })
      fetchLaureats()
    } catch (error) {
      console.error('Error deleting laureat:', error)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Lauréats</h1>
        <Link href="/admin/laureats/new" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
          Ajouter
        </Link>
      </div>

      {/* Filtres */}
      <form onSubmit={handleSearch} className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <input
              type="text"
              placeholder="Rechercher..."
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
              <option value="EN_COURS">En cours</option>
              <option value="VALIDE">Validé</option>
              <option value="REFUSE">Refusé</option>
              <option value="ABANDONNE">Abandonné</option>
            </select>
          </div>
          <div>
            <select
              value={filters.source}
              onChange={(e) => setFilters({ ...filters, source: e.target.value, page: 1 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">Toutes les sources</option>
              <option value="CHENE">CHENE</option>
              <option value="ACTEE">ACTEE</option>
              <option value="ACTEE_PLUS">ACTEE+</option>
              <option value="PENSEE_PLUS">PENSÉE+</option>
              <option value="IMPORT">Import</option>
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
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Statut</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Région</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Coût</th>
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
            ) : laureats.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                  Aucun lauréat trouvé
                </td>
              </tr>
            ) : (
              laureats.map((laureat) => (
                <tr key={laureat.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{laureat.nom}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{laureat.type || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        laureat.statut === 'VALIDE'
                          ? 'bg-green-100 text-green-800'
                          : laureat.statut === 'EN_COURS'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {laureat.statut}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{laureat.source}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {laureat.region?.nom || laureat.regionCode || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {laureat.coutTotal
                      ? new Intl.NumberFormat('fr-FR', {
                          style: 'currency',
                          currency: 'EUR',
                          maximumFractionDigits: 0,
                        }).format(laureat.coutTotal)
                      : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <Link href={`/admin/laureats/${laureat.id}`} className="text-blue-600 hover:text-blue-900 mr-4">
                      Modifier
                    </Link>
                    <button onClick={() => handleDelete(laureat.id)} className="text-red-600 hover:text-red-900">
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
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
                disabled={filters.page <= 1}
                className="px-4 py-2 border rounded-md disabled:opacity-50"
              >
                Précédent
              </button>
              <button
                onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
                disabled={filters.page >= pagination.pages}
                className="px-4 py-2 border rounded-md disabled:opacity-50"
              >
                Suivant
              </button>
            </div>
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
