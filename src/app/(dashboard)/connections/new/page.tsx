"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ROUTES } from "@/config/routes";

export default function ConnectionsNewPage() {
  const router = useRouter();
  useEffect(() => { router.replace(ROUTES.FLOWS); }, [router]);
  return null;
}
