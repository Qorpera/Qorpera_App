"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";

export interface UserContextValue {
  user: { id: string; name: string; email: string; role: string } | null;
  operatorId: string | null;
  role: string | null;
  scopes: string[] | "all" | null;
  isSuperadmin: boolean;
  actingAsOperator: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  refresh: () => void;
}

const UserContext = createContext<UserContextValue>({
  user: null,
  operatorId: null,
  role: null,
  scopes: null,
  isSuperadmin: false,
  actingAsOperator: false,
  isAdmin: false,
  isLoading: true,
  refresh: () => {},
});

export function useUser() {
  return useContext(UserContext);
}

const PUBLIC_PATHS = ["/login", "/register", "/invite"];

export function UserProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<Omit<UserContextValue, "refresh">>({
    user: null,
    operatorId: null,
    role: null,
    scopes: null,
    isSuperadmin: false,
    actingAsOperator: false,
    isAdmin: false,
    isLoading: true,
  });

  const isPublicPath = PUBLIC_PATHS.some((p) => pathname?.startsWith(p));

  function fetchUser() {
    if (isPublicPath) {
      setState((prev) => ({ ...prev, isLoading: false }));
      return;
    }

    fetch("/api/auth/me")
      .then(async (res) => {
        if (!res.ok) {
          router.push("/login");
          return;
        }
        const data = await res.json();
        const role = data.user?.role ?? null;
        const isAdmin = role === "admin" || role === "superadmin";

        setState({
          user: data.user ?? null,
          operatorId: data.operator?.id ?? null,
          role,
          scopes: data.scopes ?? null,
          isSuperadmin: data.isSuperadmin ?? false,
          actingAsOperator: data.actingAsOperator ?? false,
          isAdmin,
          isLoading: false,
        });
      })
      .catch(() => {
        setState((prev) => ({ ...prev, isLoading: false }));
      });
  }

  useEffect(() => {
    fetchUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <UserContext.Provider value={{ ...state, refresh: fetchUser }}>
      {children}
    </UserContext.Provider>
  );
}
