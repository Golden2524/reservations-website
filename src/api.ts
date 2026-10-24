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

export type Property = { slug: string; name: string; description: string; area: string; city: string; state: string; photo_urls?: string[]; from_nightly_rate_naira: number; maximum_guests: number }
export type Unit = { id: string; name: string; unit_type: string; max_guests: number; base_nightly_rate_naira: number; cleaning_fee_naira: number }

export const getProperties = (guests: number) => apiRequest<{ data: Property[] }>(`/properties?area=Kuje&guests=${guests}`)
export const getAvailability = (slug: string, checkIn: string, checkOut: string, guests: number) => apiRequest<{ data: Unit[] }>(`/properties/${slug}/availability?checkIn=${checkIn}&checkOut=${checkOut}&guests=${guests}`)

export type Account = { accessToken: string; user: { id?: string; firstName: string; lastName: string; email: string; role: string } }
export type HostApplication = { id: string; status: 'SUBMITTED' | 'REJECTED' | 'APPROVED'; business_name: string; business_phone: string; notes?: string | null; review_note?: string | null; created_at: string; updated_at: string; reviewed_at?: string | null }
export type HostProperty = { id: string; name: string; slug: string; status: string; area: string; city: string; photo_urls?: string[]; created_at: string; unit_count: number }

const bearer = (accessToken: string) => ({ Authorization: `Bearer ${accessToken}` })
export const getMyHostApplication = (accessToken: string) => apiRequest<{ data: HostApplication | null }>('/host-applications/mine', { headers: bearer(accessToken) })
export const submitHostApplication = (accessToken: string, body: { businessName: string; businessPhone: string; notes?: string }) => apiRequest<{ data: HostApplication }>('/host-applications', { method: 'POST', headers: { 'Content-Type': 'application/json', ...bearer(accessToken) }, body: JSON.stringify(body) })
export const getHostProperties = (accessToken: string) => apiRequest<{ data: HostProperty[] }>('/host/properties', { headers: bearer(accessToken) })
export const createHostProperty = (accessToken: string, body: Record<string, unknown>) => apiRequest<{ data: HostProperty }>('/host/properties', { method: 'POST', headers: { 'Content-Type': 'application/json', ...bearer(accessToken) }, body: JSON.stringify(body) })
export const createHostUnit = (accessToken: string, propertyId: string, body: Record<string, unknown>) => apiRequest<{ data: { id: string } }>(`/host/properties/${propertyId}/units`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...bearer(accessToken) }, body: JSON.stringify(body) })
export const submitHostProperty = (accessToken: string, propertyId: string) => apiRequest<{ data: HostProperty }>(`/host/properties/${propertyId}/submit`, { method: 'POST', headers: bearer(accessToken) })
export type UploadSignature = { cloudName: string; apiKey: string; timestamp: number; folder: string; signature: string }
export const getPropertyImageUploadSignature = (accessToken: string) => apiRequest<{ data: UploadSignature }>('/uploads/property-image-signature', { method: 'POST', headers: bearer(accessToken) })
export const updateHostPropertyPhotos = (accessToken: string, propertyId: string, photoUrls: string[]) => apiRequest<{ data: HostProperty }>(`/host/properties/${propertyId}/photos`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...bearer(accessToken) }, body: JSON.stringify({ photoUrls }) })

export type AdminHostApplication = { id: string; business_name: string; business_phone: string; notes?: string | null; status: string; created_at: string; applicant_id: string; email: string; first_name: string; last_name: string }
export type AdminPropertyReview = { id: string; name: string; slug: string; description: string; address_line_1: string; area: string; city: string; state: string; photo_urls?: string[]; status: string; created_at: string; updated_at: string; business_name: string; host_email: string; unit_count: number }
export const getAdminHostApplications = (accessToken: string) => apiRequest<{ data: AdminHostApplication[] }>('/admin/host-applications', { headers: bearer(accessToken) })
export const reviewHostApplication = (accessToken: string, id: string, decision: 'approve' | 'reject', reviewNote?: string) => apiRequest(`/admin/host-applications/${id}/${decision}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...bearer(accessToken) }, body: JSON.stringify({ reviewNote }) })
export const getAdminPropertyReviews = (accessToken: string) => apiRequest<{ data: AdminPropertyReview[] }>('/admin/properties/review', { headers: bearer(accessToken) })
export const approveAdminProperty = (accessToken: string, id: string, reviewNote?: string) => apiRequest(`/admin/properties/${id}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...bearer(accessToken) }, body: JSON.stringify({ reviewNote }) })
