import { useQuery } from '@tanstack/react-query'
import { request } from '../../shared/api/client'
import type { Page } from '../../shared/api/types'
import { useAuth } from '../auth/AuthProvider'

type Role = 'OWNER' | 'EDITOR' | 'OPERATOR' | 'VIEWER'
interface Member { userId: string; role: Role }

export function usePortfolioPermissions(portfolioId: string | undefined) {
  const { account } = useAuth()
  return useQuery({
    queryKey: ['portfolio-permission', portfolioId, account?.id],
    enabled: !!portfolioId && !!account,
    staleTime: 0,
    queryFn: async ({ signal }) => {
      if (!portfolioId || !account) throw new Error('Dados de autenticação ausentes')
      if (account.admin) return { edit: true, manage: true }
      let page = 0
      do {
        const { data } = await request<Page<Member>>(`/portfolios/${encodeURIComponent(portfolioId)}/members?page=${page}&size=100`, { signal })
        const member = data.content.find(item => item.userId === account.id)
        if (member) return { edit: member.role === 'OWNER' || member.role === 'EDITOR', manage: member.role === 'OWNER' }
        page++
        if (page >= data.totalPages) return { edit: false, manage: false }
      } while (true)
    },
  })
}

export function useCanEditPortfolio(portfolioId: string | undefined) {
  const query = usePortfolioPermissions(portfolioId)
  return { ...query, data: query.data?.edit }
}
