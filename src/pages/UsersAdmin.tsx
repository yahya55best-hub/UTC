import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { formatDate } from '../lib/format'
import { PageHeader, Spinner, EmptyState } from '../components/ui'
import type { Profile, UserRole } from '../lib/types'

const ROLES: UserRole[] = ['SALES', 'ADMIN', 'OWNER']

export function UsersAdminPage() {
  const { t } = useTranslation()
  const { profile: me } = useAuth()
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    // pending (inactive) first, then by created date
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('active', { ascending: true })
      .order('created_at', { ascending: false })
    setUsers((data as Profile[]) ?? [])
    setLoading(false)
  }
  useEffect(() => {
    load()
  }, [])

  async function setActive(id: string, active: boolean) {
    setBusy(id)
    await supabase.from('profiles').update({ active }).eq('id', id)
    await load()
    setBusy(null)
  }
  async function setRole(id: string, role: UserRole) {
    setBusy(id)
    await supabase.from('profiles').update({ role }).eq('id', id)
    await load()
    setBusy(null)
  }

  if (loading) return <Spinner />

  const pending = users.filter((u) => !u.active)

  return (
    <div>
      <PageHeader
        title={t('users.title')}
        subtitle={pending.length ? t('users.pendingCount', { count: pending.length }) : t('users.allActive')}
      />

      {users.length === 0 ? (
        <EmptyState message={t('common.noResults')} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-black/5 bg-black/[0.02]">
              <tr>
                <th className="th">{t('auth.displayName')}</th>
                <th className="th">{t('auth.email')}</th>
                <th className="th">{t('users.role')}</th>
                <th className="th">{t('common.status')}</th>
                <th className="th">{t('common.date')}</th>
                <th className="th text-end">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isMe = u.id === me?.id
                return (
                  <tr
                    key={u.id}
                    className={`border-b border-black/5 last:border-0 ${!u.active ? 'bg-amber-50/40' : ''}`}
                  >
                    <td className="td font-semibold text-ink">
                      {u.display_name ?? '—'} {isMe && <span className="text-xs text-ink-muted">({t('users.you')})</span>}
                    </td>
                    <td className="td">{u.email}</td>
                    <td className="td">
                      <select
                        className="input w-32 px-2 py-1 text-xs"
                        value={u.role}
                        disabled={busy === u.id || isMe}
                        onChange={(e) => setRole(u.id, e.target.value as UserRole)}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {t(`roles.${r}`)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="td">
                      {u.active ? (
                        <span className="badge bg-green-100 text-green-700">{t('users.active')}</span>
                      ) : (
                        <span className="badge bg-amber-100 text-amber-800">{t('users.pending')}</span>
                      )}
                    </td>
                    <td className="td text-xs">{formatDate(u.created_at)}</td>
                    <td className="td text-end">
                      {!u.active ? (
                        <button
                          className="btn-primary px-3 py-1 text-xs"
                          disabled={busy === u.id}
                          onClick={() => setActive(u.id, true)}
                        >
                          ✓ {t('users.approve')}
                        </button>
                      ) : (
                        <button
                          className="btn-ghost px-3 py-1 text-xs text-red-600"
                          disabled={busy === u.id || isMe}
                          onClick={() => setActive(u.id, false)}
                          title={isMe ? t('users.cantSelf') : ''}
                        >
                          {t('users.deactivate')}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
