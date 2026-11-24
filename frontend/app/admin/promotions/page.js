"use client";

import Promotions from "@/components/admin/Promotions";
import { useAdmin } from "../adminContext";

export default function PromotionsPage() {
  const { settings, templates } = useAdmin();
  return <Promotions templates={templates} brandName={settings.brandName} waEnabled={settings.waEnabled} />;
}
