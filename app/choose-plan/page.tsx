import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { ChoosePlan } from "@/components/onboarding/ChoosePlan";
import { TRIAL_DAYS } from "@/lib/billing";

export const dynamic = "force-dynamic";

export default async function ChoosePlanPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.needsPlanChoice) redirect("/home");
  return <ChoosePlan trialDays={TRIAL_DAYS} companyName={session.companyName} />;
}
