"use client";

import React from "react";
import { SmartCreationBox } from "@/app/components/smart-creation-box";

/**
 * The dashboard's unrestricted Smart Prompt Box. Every artifact type is
 * selectable, and generated results are shown inline with a "View result"
 * link to the relevant page — exactly the standalone behavior this component
 * has always had. It's now a thin wrapper around the shared
 * SmartCreationBox (see app/components/smart-creation-box.tsx), which the
 * plan/assess/create pages also use, locked to a single artifact type.
 */
export function SmartPromptBox() {
  return <SmartCreationBox />;
}
