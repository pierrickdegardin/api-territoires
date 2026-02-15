import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const email = process.env.ADMIN_EMAIL || 'admin@api-territoires.fr'
  const password = process.env.ADMIN_PASSWORD || 'admin123'
  const nom = process.env.ADMIN_NOM || 'Administrateur'

  const hashedPassword = await bcrypt.hash(password, 10)

  const admin = await prisma.adminUser.upsert({
    where: { email },
    update: {
      password: hashedPassword,
      nom,
      active: true,
    },
    create: {
      email,
      password: hashedPassword,
      nom,
      role: 'ADMIN',
      active: true,
    },
  })

  console.log('Admin créé/mis à jour:', admin.email)
  console.log('Mot de passe:', password)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
