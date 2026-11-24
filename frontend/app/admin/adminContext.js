"use client";

import { createContext, useContext } from "react";

// Shared admin data + actions, provided by the admin layout and consumed by
// each menu's page. Lets data load once and survive client-side navigation.
export const AdminContext = createContext(null);

export const useAdmin = () => {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used within the admin layout.");
  return ctx;
};
