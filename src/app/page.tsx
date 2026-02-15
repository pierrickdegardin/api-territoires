export default function Home() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>API Territoires v1.0</h1>
      <p>API publique des territoires français.</p>

      <h2>Endpoints</h2>
      <ul>
        <li>
          <a href="/api/v1/territoires/health">/api/v1/territoires/health</a> - Health check
        </li>
        <li>
          <a href="/api/v1/territoires/info">/api/v1/territoires/info</a> - Documentation
        </li>
        <li>
          <a href="/api/v1/territoires/regions">/api/v1/territoires/regions</a> - Régions
        </li>
        <li>
          <a href="/api/v1/territoires/departements">/api/v1/territoires/departements</a> - Départements
        </li>
        <li>
          <a href="/api/v1/territoires/communes?limit=10">/api/v1/territoires/communes</a> - Communes
        </li>
        <li>
          <a href="/api/v1/territoires/groupements?limit=10">/api/v1/territoires/groupements</a> - Groupements
        </li>
      </ul>

      <h2>Documentation</h2>
      <p>
        Voir <a href="/api/v1/territoires/info">/api/v1/territoires/info</a> pour la documentation complète.
      </p>
    </main>
  )
}
