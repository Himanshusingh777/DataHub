"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ROUTES } from "@/config/routes";

export default function DestinationsNewPage() {
  const router = useRouter();
  useEffect(() => { router.replace(ROUTES.FLOWS); }, [router]);
  return null;
}
