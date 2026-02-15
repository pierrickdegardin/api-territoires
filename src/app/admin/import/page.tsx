'use client'

import { useState } from 'react'

interface ImportResult {
  success: boolean
  type: string
  created: number
  updated: number
  errors: string[]
}

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null)
  const [type, setType] = useState<string>('laureats')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('type', type)

      const res = await fetch('/api/v1/import', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Erreur lors de l'import")
        return
      }

      setResult(data)
    } catch (err) {
      setError('Erreur de connexion au serveur')
    } finally {
      setLoading(false)
    }
  }

  const downloadTemplate = (templateType: string) => {
    const templates: Record<string, string[][]> = {
      laureats: [
        [
          'Nom',
          'Type',
          'Code INSEE',
          'SIREN',
          'Code Région',
          'Code Département',
          'Code Commune',
          'SIREN Groupement',
          'Statut',
          'Source',
          'AAP',
          'Commentaires',
          'Contact Nom',
          'Contact Email',
          'Contact Téléphone',
          'Coût Total',
          'Aide Sollicitée',
          'Aide Validée',
          'Lot 1',
          'Lot 2',
          'Lot 3',
          'Lot 4',
          'Lot 5',
        ],
        [
          'Exemple Lauréat',
          'COMMUNE',
          '75056',
          '217500016',
          '11',
          '75',
          '75056',
          '',
          'EN_COURS',
          'CHENE',
          'AAP1',
          'Commentaire exemple',
          'Jean Dupont',
          'jean.dupont@example.fr',
          '0123456789',
          '100000',
          '50000',
          '40000',
          'TRUE',
          'FALSE',
          'TRUE',
          'FALSE',
          'FALSE',
        ],
      ],
      structures: [
        [
          'Nom',
          'Type',
          'SIREN',
          'Mode Géo',
          'SIREN Groupement',
          'Code Département',
          'Code Région',
          'Adresse',
          'Code Postal',
          'Commune',
        ],
        ['Syndicat Exemple', 'SYNDICAT_ENERGIE', '123456789', 'TERRITOIRE', '200000123', '75', '11', '', '', ''],
        [
          'Hôpital Exemple',
          'ETABLISSEMENT_SANITAIRE',
          '987654321',
          'ADRESSE',
          '',
          '75',
          '11',
          '1 rue de la Santé',
          '75013',
          'Paris',
        ],
      ],
    }

    const template = templates[templateType]
    if (!template) return

    // Créer un CSV
    const csv = template.map((row) => row.join(';')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `template_${templateType}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Import de données</h1>

      {/* Templates */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Télécharger les templates</h2>
        <div className="flex flex-wrap gap-4">
          <button
            onClick={() => downloadTemplate('laureats')}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
          >
            Template Lauréats
          </button>
          <button
            onClick={() => downloadTemplate('structures')}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
          >
            Template Structures
          </button>
        </div>
      </div>

      {/* Formulaire d'import */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Importer un fichier</h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Type de données</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="laureats">Lauréats</option>
              <option value="structures">Structures</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Fichier Excel ou CSV</label>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
            <p className="mt-1 text-sm text-gray-500">Formats acceptés: .xlsx, .xls, .csv</p>
          </div>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">{error}</div>}

          {result && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
              <p className="font-semibold">Import terminé</p>
              <p>
                Créés: {result.created} | Mis à jour: {result.updated}
              </p>
              {result.errors.length > 0 && (
                <div className="mt-2">
                  <p className="font-semibold text-red-600">Erreurs ({result.errors.length}):</p>
                  <ul className="list-disc list-inside text-sm text-red-600">
                    {result.errors.slice(0, 10).map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                    {result.errors.length > 10 && <li>... et {result.errors.length - 10} autres erreurs</li>}
                  </ul>
                </div>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={!file || loading}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Import en cours...' : 'Importer'}
          </button>
        </form>
      </div>

      {/* Instructions */}
      <div className="mt-6 bg-gray-50 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Instructions</h2>
        <ul className="list-disc list-inside text-sm text-gray-600 space-y-2">
          <li>Téléchargez le template correspondant au type de données à importer</li>
          <li>Remplissez les données en respectant le format des colonnes</li>
          <li>Les lignes avec un identifiant existant (SIREN, email) seront mises à jour</li>
          <li>Les nouvelles lignes seront créées automatiquement</li>
          <li>Les codes région/département doivent correspondre aux codes officiels</li>
          <li>Pour les structures en mode ADRESSE, l&apos;adresse sera géocodée automatiquement</li>
        </ul>
      </div>
    </div>
  )
}
