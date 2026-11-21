// Centralized frontend API URL configuration
// In production builds, read from VITE_API_URL, falling back to window origin or relative API path
export const API_BASE_URL =
  import.meta.env.VITE_API_URL !== undefined
    ? import.meta.env.VITE_API_URL
    : (import.meta.env.PROD ? '' : 'http://localhost:8000');
