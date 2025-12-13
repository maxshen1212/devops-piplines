const VITE_API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  console.log(`${VITE_API_BASE_URL}${path}`);
  const res = await fetch(`${VITE_API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    throw new Error("API error");
  }

  return res.json();
}
