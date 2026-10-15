import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { CircleAlert as AlertCircle, CircleCheck as CheckCircle2, Loader } from 'lucide-react'
import { Alert } from '../components/ui/Alert'

export function Setup() {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [success, setSuccess] = useState(false)

  const setupDemoUsers = async () => {
    setLoading(true)
    setMessage('')

    try {
      const demoUsers = [
        {
          email: 'admin@club.ch',
          password: 'admin123',
          fullName: 'Admin ClubSphere',
          role: 'admin',
        },
        {
          email: 'coach@club.ch',
          password: 'coach123',
          fullName: 'Pierre Coach',
          role: 'coach',
          teamId: '11111111-1111-1111-1111-111111111111',
        },
        {
          email: 'member@club.ch',
          password: 'member123',
          fullName: 'Jean Member',
          role: 'member',
          teamId: '22222222-2222-2222-2222-222222222222',
        },
      ]

      let createdCount = 0
      let errorCount = 0

      for (const user of demoUsers) {
        try {
          const { data: authData, error: authError } = await supabase.auth.signUp({
            email: user.email,
            password: user.password,
            options: {
              data: {
                full_name: user.fullName,
              }
            }
          })

          if (authError) {
            if (authError.message.includes('already registered') || authError.message.includes('User already registered')) {
              setMessage((prev) => prev + `\n[!] ${user.email} déjà existant`)
              continue
            }
            setMessage((prev) => prev + `\n[x] ${user.email}: ${authError.message}`)
            errorCount++
            continue
          }

          if (authData.user) {
            const { error: profileError } = await supabase
              .from('profiles')
              .upsert({
                id: authData.user.id,
                full_name: user.fullName,
                email: user.email,
                role: user.role,
                team_id: user.teamId,
                active: true,
              })

            if (profileError) {
              setMessage((prev) => prev + `\n[x] Profile error for ${user.email}: ${profileError.message}`)
              errorCount++
            } else {
              setMessage((prev) => prev + `\n✓ Créé: ${user.fullName} (${user.role})`)
              createdCount++
            }
          }
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : 'Unknown error'
          setMessage((prev) => prev + `\n[x] ${user.email}: ${errMsg}`)
          errorCount++
        }
      }

      if (errorCount === 0 && createdCount > 0) {
        setSuccess(true)
        setMessage((prev) => prev + `\n\nSetup terminé! ${createdCount} utilisateur(s) créé(s).`)
      } else if (createdCount === 0 && errorCount === 0) {
        setMessage((prev) => prev + '\n\n[!] Tous les utilisateurs existent déjà.')
      } else {
        setMessage((prev) => prev + `\n\n[!] Terminé avec ${errorCount} erreur(s).`)
      }
    } catch (error) {
      setMessage(`[x] Erreur globale: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-primary-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-8 shadow-2xl">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">ClubSphere Setup</h1>
            <p className="text-gray-400 text-sm">Initialiser les données de démonstration</p>
          </div>

          <button
            onClick={setupDemoUsers}
            disabled={loading || success}
            className="w-full bg-primary-600 hover:bg-primary-700 disabled:bg-gray-700 text-white font-semibold py-3 rounded-lg transition-colors mb-4"
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <Loader className="animate-spin" size={20} />
                Setup en cours...
              </div>
            ) : success ? (
              <div className="flex items-center justify-center gap-2">
                <CheckCircle2 size={20} />
                Complété
              </div>
            ) : (
              'Démarrer le Setup'
            )}
          </button>

          {message && (
            <Alert variant={success ? 'success' : 'danger'}>
              <span className="whitespace-pre-wrap font-mono">{message}</span>
            </Alert>
          )}

          <div className="mt-6 p-4 bg-gray-800/50 rounded-lg border border-gray-700 text-xs text-gray-400">
            <p className="font-semibold mb-2 text-gray-300">Identifiants de démo:</p>
            <p>admin@club.ch / admin123</p>
            <p>coach@club.ch / coach123</p>
            <p>member@club.ch / member123</p>
          </div>

          {success && (
            <a
              href="/login"
              className="mt-4 w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-lg transition-colors"
            >
              Aller à la page de connexion
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
