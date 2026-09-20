"use client";

import { useQuery } from "@tanstack/react-query";
import { fetcher } from "@/lib/fetcher";

export interface HealthData {
  status: "ok";
}

export const healthQueryKeys = {
  all: ["health"] as const,
};

export function useHealthQuery() {
  return useQuery({
    queryKey: healthQueryKeys.all,
    queryFn: () => fetcher<HealthData>("/health/live"),
    staleTime: 30 * 1000,
  });
}
