"use client";

import Templates from "@/components/admin/Templates";
import { useAdmin } from "../adminContext";

export default function TemplatesPage() {
  const { settings, templates, createTemplate, updateTemplate, deleteTemplate } = useAdmin();
  return (
    <Templates
      templates={templates}
      rewardTemplateName={settings.waTemplateName}
      brandName={settings.brandName}
      onCreate={createTemplate}
      onUpdate={updateTemplate}
      onDelete={deleteTemplate}
    />
  );
}
