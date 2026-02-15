import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import * as ExcelJS from 'exceljs'
import { importTypeSchema } from '@/lib/validation'
import { withRequestLogging } from '@/lib/logger'

// POST /api/v1/import - Import Excel générique
async function handlePost(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const type = formData.get('type') as string // 'laureats', 'structures'

    if (!file) {
      return NextResponse.json({ error: 'Fichier requis' }, { status: 400 })
    }

    // Validate import type with Zod
    const typeResult = importTypeSchema.safeParse(type)
    if (!typeResult.success) {
      return NextResponse.json({ error: 'Type invalide. Valeurs acceptées: laureats, structures' }, { status: 400 })
    }

    // Lire le fichier Excel
    const buffer = await file.arrayBuffer()
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)
    const worksheet = workbook.worksheets[0]

    // Convertir les lignes en objets JSON
    const data: any[] = []
    const headers: string[] = []

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        // Première ligne = headers
        row.eachCell((cell) => {
          headers.push(cell.value?.toString() || '')
        })
      } else {
        // Lignes suivantes = données
        const rowData: any = {}
        row.eachCell((cell, colNumber) => {
          const header = headers[colNumber - 1]
          if (header) {
            rowData[header] = cell.value
          }
        })
        data.push(rowData)
      }
    })

    let result: { created: number; updated: number; errors: string[] }

    switch (type) {
      case 'laureats':
        result = await importLaureats(data)
        break
      case 'structures':
        result = await importStructures(data)
        break
      default:
        return NextResponse.json({ error: 'Type non supporté' }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      type,
      ...result,
    })
  } catch (error) {
    console.error('Error importing data:', error)
    return NextResponse.json({ error: "Erreur lors de l'import" }, { status: 500 })
  }
}

async function importLaureats(data: any[]): Promise<{ created: number; updated: number; errors: string[] }> {
  let created = 0
  let updated = 0
  const errors: string[] = []

  for (const row of data) {
    try {
      // Mapper les colonnes Excel vers le modèle
      const laureatData = {
        nom: row['Nom'] || row['nom'],
        type: row['Type'] || row['type'],
        codeInsee: row['Code INSEE'] || row['codeInsee'],
        siren: row['SIREN'] || row['siren'],
        regionCode: row['Code Région'] || row['regionCode'],
        departementCode: row['Code Département'] || row['departementCode'],
        communeCode: row['Code Commune'] || row['communeCode'],
        groupementSiren: row['SIREN Groupement'] || row['groupementSiren'],
        statut: row['Statut'] || row['statut'] || 'EN_COURS',
        source: row['Source'] || row['source'] || 'IMPORT',
        aap: row['AAP'] || row['aap'],
        commentaires: row['Commentaires'] || row['commentaires'],
        contactNom: row['Contact Nom'] || row['contactNom'],
        contactEmail: row['Contact Email'] || row['contactEmail'],
        contactTelephone: row['Contact Téléphone'] || row['contactTelephone'],
        coutTotal: parseFloat(row['Coût Total'] || row['coutTotal']) || null,
        aideSollicitee: parseFloat(row['Aide Sollicitée'] || row['aideSollicitee']) || null,
        aideValidee: parseFloat(row['Aide Validée'] || row['aideValidee']) || null,
        lot1: !!row['Lot 1'] || !!row['lot1'],
        lot2: !!row['Lot 2'] || !!row['lot2'],
        lot3: !!row['Lot 3'] || !!row['lot3'],
        lot4: !!row['Lot 4'] || !!row['lot4'],
        lot5: !!row['Lot 5'] || !!row['lot5'],
      }

      if (!laureatData.nom) {
        errors.push(`Ligne ignorée: nom manquant`)
        continue
      }

      // Upsert basé sur SIREN ou nom+région
      const existing = laureatData.siren
        ? await prisma.laureat.findFirst({ where: { siren: laureatData.siren } })
        : await prisma.laureat.findFirst({
            where: {
              nom: laureatData.nom,
              regionCode: laureatData.regionCode,
            },
          })

      if (existing) {
        await prisma.laureat.update({
          where: { id: existing.id },
          data: laureatData,
        })
        updated++
      } else {
        await prisma.laureat.create({ data: laureatData })
        created++
      }
    } catch (e: any) {
      errors.push(`Erreur ligne ${row['Nom'] || 'inconnue'}: ${e.message}`)
    }
  }

  return { created, updated, errors }
}

async function importStructures(data: any[]): Promise<{ created: number; updated: number; errors: string[] }> {
  let created = 0
  let updated = 0
  const errors: string[] = []

  for (const row of data) {
    try {
      const structureData = {
        nom: row['Nom'] || row['nom'],
        type: row['Type'] || row['type'] || 'AUTRE',
        siren: row['SIREN'] || row['siren'],
        geoMode: row['Mode Géo'] || row['geoMode'] || 'TERRITOIRE',
        groupementSiren: row['SIREN Groupement'] || row['groupementSiren'],
        departementCode: row['Code Département'] || row['departementCode'],
        regionCode: row['Code Région'] || row['regionCode'],
        adresse: row['Adresse'] || row['adresse'],
        codePostal: row['Code Postal'] || row['codePostal'],
        commune: row['Commune'] || row['commune'],
      }

      if (!structureData.nom) {
        errors.push(`Ligne ignorée: nom manquant`)
        continue
      }

      // Géocoder si mode ADRESSE
      let latitude = null
      let longitude = null
      if (structureData.geoMode === 'ADRESSE' && structureData.adresse) {
        try {
          const adresseComplete = `${structureData.adresse} ${structureData.codePostal} ${structureData.commune}`
          const response = await fetch(
            `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(adresseComplete)}&limit=1`
          )
          const geoData = await response.json()
          if (geoData.features && geoData.features.length > 0) {
            const [lon, lat] = geoData.features[0].geometry.coordinates
            longitude = lon
            latitude = lat
          }
        } catch (e) {
          console.error('Geocoding error:', e)
        }
      }

      // Upsert basé sur SIREN ou nom
      const existing = structureData.siren
        ? await prisma.structure.findFirst({ where: { siren: structureData.siren } })
        : await prisma.structure.findFirst({ where: { nom: structureData.nom } })

      if (existing) {
        await prisma.structure.update({
          where: { id: existing.id },
          data: { ...structureData, latitude, longitude },
        })
        updated++
      } else {
        await prisma.structure.create({
          data: { ...structureData, latitude, longitude },
        })
        created++
      }
    } catch (e: any) {
      errors.push(`Erreur ligne ${row['Nom'] || 'inconnue'}: ${e.message}`)
    }
  }

  return { created, updated, errors }
}

export const POST = withRequestLogging(handlePost)
