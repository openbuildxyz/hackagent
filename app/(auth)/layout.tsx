import PublicNavbar from '@/components/PublicNavbar'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PublicNavbar />
      {children}
    </>
  )
}
