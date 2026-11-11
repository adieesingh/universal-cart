const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export type CartItem = {
  id: string;
  url: string;
  store: string;
  title: string | null;
  image: string | null;
  price: number | null;
  currency: string | null;
  quantity: number;
};

async function request<T>(path: string, token: string | null, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string }>("/auth/login", null, {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  register: (email: string, password: string) =>
    request<{ token: string }>("/auth/register", null, {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  getItems: (token: string) => request<{ items: CartItem[] }>("/items", token),
  addItem: (token: string, text: string) =>
    request<{ item: CartItem; duplicate: boolean }>("/items", token, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  setQuantity: (token: string, id: string, quantity: number) =>
    request<{ ok: true }>(`/items/${id}`, token, {
      method: "PATCH",
      body: JSON.stringify({ quantity }),
    }),
  removeItem: (token: string, id: string) =>
    request<{ ok: true }>(`/items/${id}`, token, { method: "DELETE" }),
};
