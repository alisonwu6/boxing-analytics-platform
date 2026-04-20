import { Navigate } from "react-router-dom";
import { storage } from "../utils/storage";
import type { ReactNode } from "react";

interface ProtectedRouteProps {
  children: ReactNode;
}

export default function ProtectedRoute({
  children,
}: ProtectedRouteProps) {
  const isAuthenticated = storage.isAuthenticated();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}