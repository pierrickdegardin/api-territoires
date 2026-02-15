import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

let _jwtSecret: Uint8Array | null = null
function getJwtSecret(): Uint8Array {
  if (!_jwtSecret) {
    const secret = process.env.JWT_SECRET
    if (!secret && process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET environment variable is required in production')
    }
    _jwtSecret = new TextEncoder().encode(secret || 'dev-only-secret-do-not-use-in-production')
  }
  return _jwtSecret
}

const COOKIE_NAME = 'admin_session'

export interface SessionPayload {
  userId: string
  email: string
  nom: string
  role: string
  exp: number
}

export async function createSession(userId: string, email: string, nom: string, role: string) {
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 // 24h

  const token = await new SignJWT({
    userId,
    email,
    nom,
    role,
    exp: expiresAt,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(expiresAt)
    .sign(getJwtSecret())

  ;(await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: new Date(expiresAt * 1000),
    path: '/',
  })

  return token
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookie = (await cookies()).get(COOKIE_NAME)

  if (!cookie?.value) {
    return null
  }

  try {
    const { payload } = await jwtVerify(cookie.value, getJwtSecret())
    return payload as unknown as SessionPayload
  } catch (error) {
    return null
  }
}

export async function deleteSession() {
  ;(await cookies()).delete(COOKIE_NAME)
}

export async function verifyCredentials(email: string, password: string) {
  const user = await prisma.adminUser.findUnique({
    where: { email },
  })

  if (!user || !user.active) {
    return null
  }

  const valid = await bcrypt.compare(password, user.password)
  if (!valid) {
    return null
  }

  // Mettre à jour la dernière connexion
  await prisma.adminUser.update({
    where: { id: user.id },
    data: { lastLogin: new Date() },
  })

  return {
    id: user.id,
    email: user.email,
    nom: user.nom,
    role: user.role,
  }
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10)
}
