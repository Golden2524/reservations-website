const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'https://reserveflow-api-l7bs.onrender.com/api/v1'

export const apiBaseUrl = configuredBaseUrl.replace(/\/$/, '')

export type ApiHealth = {
  status: 'ok'
  service: string
  environment: 'development' | 'production' | string
  timestamp: string
}

export class ApiRequestError extends Error {
  readonly status: number
  readonly code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.code = code
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: { Accept: 'application/json', ...init.headers },
  })

  const body = await response.json().catch(() => null) as { error?: string; code?: string } | T | null
  if (!response.ok) {
    const error = body as { error?: string; code?: string } | null
    throw new ApiRequestError(error?.error ?? 'Unable to reach ReserveFlow right now.', response.status, error?.code)
  }

  return body as T
}

export const getApiHealth = () => apiRequest<ApiHealth>('/health')

export type Property = { slug: string; name: string; description: string; area: string; city: string; state: string; from_nightly_rate_naira: number; maximum_guests: number }
export type Unit = { id: string; name: string; unit_type: string; max_guests: number; base_nightly_rate_naira: number; cleaning_fee_naira: number }

export const getProperties = (guests: number) => apiRequest<{ data: Property[] }>(`/properties?area=Kuje&guests=${guests}`)
export const getAvailability = (slug: string, checkIn: string, checkOut: string, guests: number) => apiRequest<{ data: Unit[] }>(`/properties/${slug}/availability?checkIn=${checkIn}&checkOut=${checkOut}&guests=${guests}`)
