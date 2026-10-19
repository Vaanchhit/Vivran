// Teaching memory now lives with the files it is learned from: My sources → Style / Habits.
import { redirect } from "next/navigation";

export default function TeachingMemoryMoved({ searchParams }: { searchParams: { tab?: string } }) {
  redirect(`/teacher/materials?tab=${searchParams.tab === "habits" ? "habits" : "style"}`);
}
