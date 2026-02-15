/**
 * Alias Resolution Service for API Territoires (Autonome)
 *
 * Provides lookup of official territory codes from aliases (non-standard names)
 */

import { prisma } from '@/lib/prisma'

export interface AliasResult {
  code: string
  confidence: number // 1.0 = exact, 0.95 = normalized, 0.9 = fuzzy
  source?: string | null
  matchType: 'exact' | 'normalized' | 'fuzzy'
  type?: string
}

/**
 * Normalize a name for matching
 * Removes accents, lowercases, removes non-alphanumeric
 */
export function normalizeNom(nom: string): string {
  return nom
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9]/g, '') // Keep only alphanum
    .trim()
}

/**
 * Find territory code by alias name
 *
 * Search order:
 * 1. Exact match on alias
 * 2. Normalized match on aliasNorm
 * 3. Direct match on Region/Departement/Commune/Groupement nom
 *
 * @param nom - The name to search for
 * @returns AliasResult or null if not found
 */
export async function findByAlias(nom: string): Promise<AliasResult | null> {
  if (!nom || nom.trim().length === 0) {
    return null
  }

  const normalized = normalizeNom(nom)

  // 1. Exact alias match
  const exactAlias = await prisma.alias.findFirst({
    where: { alias: nom },
    select: { codeOfficiel: true, source: true, type: true },
  })

  if (exactAlias) {
    return {
      code: exactAlias.codeOfficiel,
      confidence: 1.0,
      source: exactAlias.source,
      type: exactAlias.type,
      matchType: 'exact',
    }
  }

  // 2. Normalized alias match
  const normalizedAlias = await prisma.alias.findFirst({
    where: { aliasNorm: normalized },
    select: { codeOfficiel: true, source: true, type: true },
  })

  if (normalizedAlias) {
    return {
      code: normalizedAlias.codeOfficiel,
      confidence: 0.95,
      source: normalizedAlias.source,
      type: normalizedAlias.type,
      matchType: 'normalized',
    }
  }

  // 3. Direct match on territoire tables
  // Try Region
  const region = await prisma.region.findFirst({
    where: { nom: { equals: nom, mode: 'insensitive' } },
    select: { code: true },
  })
  if (region) {
    return { code: region.code, confidence: 1.0, type: 'region', matchType: 'exact' }
  }

  // Try Departement
  const dept = await prisma.departement.findFirst({
    where: { nom: { equals: nom, mode: 'insensitive' } },
    select: { code: true },
  })
  if (dept) {
    return { code: dept.code, confidence: 1.0, type: 'departement', matchType: 'exact' }
  }

  // Try Commune
  const commune = await prisma.commune.findFirst({
    where: { nom: { equals: nom, mode: 'insensitive' } },
    select: { code: true },
  })
  if (commune) {
    return { code: commune.code, confidence: 1.0, type: 'commune', matchType: 'exact' }
  }

  // Try Groupement
  const groupement = await prisma.groupement.findFirst({
    where: { nom: { equals: nom, mode: 'insensitive' } },
    select: { siren: true, type: true },
  })
  if (groupement) {
    return {
      code: groupement.siren,
      confidence: 1.0,
      type: groupement.type.toLowerCase(),
      matchType: 'exact',
    }
  }

  return null
}

/**
 * Find territory by code (INSEE or SIREN)
 */
export async function findByCode(code: string): Promise<{ code: string; nom: string; type: string } | null> {
  if (!code || code.trim().length === 0) {
    return null
  }

  const trimmedCode = code.trim()

  // Try Region (2 chars)
  if (trimmedCode.length === 2) {
    const region = await prisma.region.findUnique({
      where: { code: trimmedCode },
      select: { code: true, nom: true },
    })
    if (region) {
      return { ...region, type: 'region' }
    }
  }

  // Try Departement (2-3 chars)
  if (trimmedCode.length <= 3) {
    const dept = await prisma.departement.findUnique({
      where: { code: trimmedCode },
      select: { code: true, nom: true },
    })
    if (dept) {
      return { ...dept, type: 'departement' }
    }
  }

  // Try Commune (5 chars)
  if (trimmedCode.length === 5) {
    const commune = await prisma.commune.findUnique({
      where: { code: trimmedCode },
      select: { code: true, nom: true },
    })
    if (commune) {
      return { ...commune, type: 'commune' }
    }
  }

  // Try Groupement (9 chars SIREN)
  if (trimmedCode.length === 9) {
    const groupement = await prisma.groupement.findUnique({
      where: { siren: trimmedCode },
      select: { siren: true, nom: true, type: true },
    })
    if (groupement) {
      return { code: groupement.siren, nom: groupement.nom, type: groupement.type.toLowerCase() }
    }
  }

  return null
}

/**
 * Get all aliases for a given territory code
 */
export async function getAliasesForCode(code: string): Promise<string[]> {
  const aliases = await prisma.alias.findMany({
    where: { codeOfficiel: code },
    select: { alias: true },
  })

  return aliases.map((a) => a.alias)
}

/**
 * Create a new alias
 */
export async function createAlias(
  aliasName: string,
  codeOfficiel: string,
  type: string,
  source: string = 'manual'
): Promise<void> {
  const normalized = normalizeNom(aliasName)

  await prisma.alias.create({
    data: {
      alias: aliasName,
      aliasNorm: normalized,
      codeOfficiel,
      type,
      source,
    },
  })
}

/**
 * Check if a code exists in the database
 */
export async function codeExists(code: string): Promise<boolean> {
  const result = await findByCode(code)
  return result !== null
}
