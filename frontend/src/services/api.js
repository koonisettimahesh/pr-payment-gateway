const API_BASE =
  import.meta.env.VITE_API_BASE || "http://localhost:8000";

export async function apiFetch(path, options = {}) {
  const apiKey = localStorage.getItem("api_key");
  const apiSecret = localStorage.getItem("api_secret");

  const headers = {
    "Content-Type": "application/json",
    ...(apiKey && apiSecret
      ? {
          "X-Api-Key": apiKey,
          "X-Api-Secret": apiSecret
        }
      : {}),
    ...options.headers
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  const data = await res.json();

  if (!res.ok) {
    throw data;
  }

  return data;
}
