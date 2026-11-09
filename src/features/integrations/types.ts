export interface Integration {
  id: string
  portfolioId: string
  name: string
  active: boolean
  credentialSource: string
  serviceUrl: string | null
}
export interface TargetConfig {
  name: string
  environmentType: 'DRAFT' | 'LIVE'
  assistantId: string | null
  environmentId: string | null
  dialogWorkspaceId: string | null
  dialogSkillId: string | null
  actionSkillId: string | null
  v1Version: string
  v2Version: string
}
export interface Target {
  id: string
  projectId: string
  integrationId: string
  active: boolean
  configuration: TargetConfig
}
export interface Probe {
  checkedAt: string
  successful: boolean
  checks: { resource: string; status: string; code: string }[]
}
