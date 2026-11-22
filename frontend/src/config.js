// Centralized frontend API URL configuration
// In production builds, read from VITE_API_URL, falling back to window origin or relative API path
export const API_BASE_URL =
  import.meta.env.VITE_API_URL !== undefined
    ? import.meta.env.VITE_API_URL
    : (import.meta.env.PROD ? '' : 'http://localhost:8000');

/**
 * Extracts the backend's detailed error message from an API response.
 * Handles FastAPI HTTPException {"detail": "..."}, validation errors,
 * rate limit responses {"detail": "...", "error": "..."}, or generic fallback.
 */
export async function extractErrorMessage(res, fallback = 'Request failed') {
  try {
    const data = await res.json();
    if (data) {
      if (typeof data.detail === 'string' && data.detail.trim()) {
        return data.detail;
      }
      if (Array.isArray(data.detail) && data.detail.length > 0) {
        return data.detail
          .map((d) => d.msg || (typeof d === 'string' ? d : JSON.stringify(d)))
          .join('; ');
      }
      if (typeof data.detail === 'object' && data.detail !== null) {
        return JSON.stringify(data.detail);
      }
      if (typeof data.error === 'string' && data.error.trim()) {
        return data.error;
      }
      if (typeof data.message === 'string' && data.message.trim()) {
        return data.message;
      }
    }
  } catch (_) {
    // Non-JSON response, fall through
  }

  if (res.status === 429) {
    return 'Rate limit reached, try again in a minute.';
  }
  if (res.status === 413) {
    return 'Upload exceeds maximum permitted size.';
  }
  return fallback;
}
