'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Structure {
  id: string
  nom: string
  type: string
  siren: string | null
  geoMode: string
  region?: { nom: string }
  departement?: { nom: string }
  _count?: { economes: number }
}

interface Pagination {
  page: number
  limit: number
  total: number
  pages: number
}

export default function StructuresPage() {
  const [structures, setStructures] = useState<Structure[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    page: 1,
    q: '',
    type: '',
    geoMode: '',
  })

  const fetchStructures = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', filters.page.toString())
      params.set('limit', '20')
      if (filters.q) params.set('q', filters.q)
      if (filters.type) params.set('type', filters.type)
      if (filters.geoMode) params.set('geoMode', filters.geoMode)

      const res = await fetch(`/api/v1/structures?${params}`)
      const data = await res.json()
      setStructures(data.structures || [])
      setPagination(data.pagination)
    } catch (error) {
      console.error('Error fetching structures:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStructures()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.page, filters.type, filters.geoMode])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setFilters({ ...filters, page: 1 })
    fetchStructures()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cette structure ?')) return

    try {
      const res = await fetch(`/api/v1/structures/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || 'Erreur lors de la suppression')
        return
      }
      fetchStructures()
    } catch (error) {
      console.error('Error deleting structure:', error)
    }
  }

  const typeLabels: Record<string, string> = {
    COMMUNE: 'Commune',
    SYNDICAT_ENERGIE: 'Syndicat énergie',
    SYNDICAT_MIXTE: 'Syndicat mixte',
    EPCI: 'EPCI',
    DEPARTEMENT: 'Département',
    REGION: 'Région',
    ETABLISSEMENT_SANITAIRE: 'Établ. sanitaire',
    ARS: 'ARS',
    DDT: 'DDT',
    DREAL: 'DREAL',
    ADEME: 'ADEME',
    AUTRE: 'Autre',
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Structures</h1>
        <Link href="/admin/structures/new" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
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
              value={filters.type}
              onChange={(e) => setFilters({ ...filters, type: e.target.value, page: 1 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">Tous les types</option>
              {Object.entries(typeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <select
              value={filters.geoMode}
              onChange={(e) => setFilters({ ...filters, geoMode: e.target.value, page: 1 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">Tous les modes géo</option>
              <option value="TERRITOIRE">Territoire</option>
              <option value="CUSTOM">Personnalisé</option>
              <option value="ADRESSE">Adresse</option>
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
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SIREN</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Mode géo
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Territoire
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Économes
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
            ) : structures.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                  Aucune structure trouvée
                </td>
              </tr>
            ) : (
              structures.map((structure) => (
                <tr key={structure.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{structure.nom}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {typeLabels[structure.type] || structure.type}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{structure.siren || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        structure.geoMode === 'TERRITOIRE'
                          ? 'bg-blue-100 text-blue-800'
                          : structure.geoMode === 'CUSTOM'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-green-100 text-green-800'
                      }`}
                    >
                      {structure.geoMode}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {structure.departement?.nom || structure.region?.nom || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {structure._count?.economes || 0}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <Link href={`/admin/structures/${structure.id}`} className="text-blue-600 hover:text-blue-900 mr-4">
                      Modifier
                    </Link>
                    <button onClick={() => handleDelete(structure.id)} className="text-red-600 hover:text-red-900">
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
