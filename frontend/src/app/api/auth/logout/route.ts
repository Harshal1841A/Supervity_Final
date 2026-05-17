import { NextResponse } from 'next/server'

export async function GET() {
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3001'
  return NextResponse.redirect(`${baseUrl}/api/auth/signout`)
}
