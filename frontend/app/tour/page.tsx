"use client";

// /tour: Vivran end to end, for one lesson, as a teacher, a student and a school
// would see it. A frontend-only proxy of the product with sample data (story.ts);
// it makes no API calls. ?embed=1 drops the page chrome for the landing page iframe.
import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Building2, GraduationCap, Presentation } from "lucide-react";
import { TourShell, type Role } from "./engine";
import { TEACHER_NAV, TEACHER_SCENES } from "./scenes-teacher";
import { INSTITUTION_NAV, INSTITUTION_SCENES, STUDENT_NAV, STUDENT_SCENES } from "./scenes-others";

const ROLES: Role[] = [
  { id: "teacher", label: "Teacher", icon: <Presentation className="w-4 h-4" />, tagline: "Live today. From one chapter to slides, a paper and an explanation, in your own style.", nav: TEACHER_NAV, scenes: TEACHER_SCENES },
  { id: "student", label: "Student", icon: <GraduationCap className="w-4 h-4" />, preview: true, tagline: "Coming next. Students revise and practise from exactly what their teacher taught.", nav: STUDENT_NAV, scenes: STUDENT_SCENES },
  { id: "institution", label: "School", icon: <Building2 className="w-4 h-4" />, preview: true, tagline: "Coming next. The school sees what is taught, what is learned, and where to help, before the final marks.", nav: INSTITUTION_NAV, scenes: INSTITUTION_SCENES },
];

function Tour() {
  const embed = useSearchParams().get("embed") === "1";
  return (
    <div className={embed ? "bg-background" : "min-h-screen bg-background"}>
      {!embed && (
        <header className="max-w-6xl mx-auto px-4 pt-10 text-center">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Product tour · sample data</div>
          <h1 className="text-3xl sm:text-4xl font-extrabold font-display text-foreground mt-2">One lesson, three people</h1>
          <p className="text-sm text-muted mt-2">Follow Class 9&rsquo;s French Revolution unit from the teacher, to the students, to the school.</p>
        </header>
      )}
      <TourShell roles={ROLES} embed={embed} />
    </div>
  );
}

export default function TourPage() {
  return <Suspense fallback={null}><Tour /></Suspense>;
}
