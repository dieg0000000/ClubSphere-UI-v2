import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export function AdminNews() {
  const navigate = useNavigate()

  useEffect(() => {
    navigate('/admin/actualites', { replace: true })
  }, [navigate])

  return null
}
