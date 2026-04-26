import { SignJWT, jwtVerify } from 'jose'
import bcrypt from 'bcryptjs'

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be configured in production')
  }
  // Development-only fallback. Never use this value in production.
  return new TextEncoder().encode(secret || 'dev-only-change-me')
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export async function createToken(userId: string, email: string): Promise<string> {
  return new SignJWT({ userId, email })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .setIssuedAt()
    .sign(getJwtSecret())
}

export async function verifyToken(token: string): Promise<{ userId: string; email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret())
    return { userId: payload.userId as string, email: payload.email as string }
  } catch {
    return null
  }
}
