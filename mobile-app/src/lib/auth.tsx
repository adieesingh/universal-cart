import React, { createContext, useContext, useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";

type AuthCtx = {    
  token: string | null;
  loading: boolean;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({
  token: null,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
});

const KEY = "ucart_token";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    SecureStore.getItemAsync(KEY)
      .then(setToken)
      .finally(() => setLoading(false));
  }, []);

  const signIn = async (t: string) => {
    await SecureStore.setItemAsync(KEY, t);
    setToken(t);
  };
  const signOut = async () => {
    await SecureStore.deleteItemAsync(KEY);
    setToken(null);
  };

  return <Ctx.Provider value={{ token, loading, signIn, signOut }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
