import { redirect } from "next/navigation";
import { isFirstRun, getSessionFromCookies } from "@/lib/auth";

export default async function Home() {
  const firstRun = await isFirstRun();
  if (firstRun) redirect("/setup");

  const session = await getSessionFromCookies();
  if (!session) redirect("/login");

  redirect("/dashboard");
}
