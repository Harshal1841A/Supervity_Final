import NextAuth from "next-auth"
import { JWT } from "next-auth/jwt"

declare module "next-auth" {
  interface Session {
    roles?: string[]
    accessToken?: string
  }

  interface User {
    roles?: string[]
    accessToken?: string
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    roles?: string[]
    accessToken?: string
  }
}
