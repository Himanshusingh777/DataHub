"use client";

import { use } from "react";
import { PipelineBuilder } from "@/components/pipelines/pipeline-builder";
import { MOCK_PIPELINES_FULL } from "@/lib/pipeline-types";

export default function PipelineBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const pipeline = MOCK_PIPELINES_FULL.find((p) => p.id === id);

  return (
    <PipelineBuilder
      pipelineId={id}
      initialName={pipeline?.name ?? "Untitled Pipeline"}
    />
  );
}
