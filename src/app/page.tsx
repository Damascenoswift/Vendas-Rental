import { redirect } from 'next/navigation'

export default function Home() {
  // Redireciona para o dashboard como página principal do app
  redirect('/dashboard')
}
