import './globals.css'

export const metadata = {
  title: 'API Territoires',
  description: 'API publique des territoires français',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="antialiased">{children}</body>
    </html>
  )
}
