import { AuthNotice } from "@/components/auth/AuthNotice";
import { ProfileForm } from "@/components/seeker/ProfileForm";
import { ProfileNav } from "@/components/seeker/ProfileNav";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/format/cn";
import { getUser } from "@/lib/adapters/auth";
import { getSeekerProfile } from "@/lib/repo/seeker";
import { signOutAction } from "@/app/auth/actions";
import { FAVORITE_GUEST_WHY } from "@/lib/seeker/constants";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "Кабинет соискателя | Террикон Работа",
  robots: { index: false, follow: false },
};

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getUser();
  if (!user) {
    notFound();
  }
  const profile = await getSeekerProfile(user.id);
  if (!profile) {
    notFound();
  }
  const query = await searchParams;

  return (
    <>
      <header className="flex min-w-0 flex-col gap-2">
        <h1 className="font-display text-2xl font-medium">Кабинет соискателя</h1>
        <p className="text-md text-muted">
          {profile.name} · {profile.email}
        </p>
        <ProfileNav current="/profile" />
      </header>
      <AuthNotice query={query} />
      <p className="max-w-xl text-sm text-muted">{FAVORITE_GUEST_WHY}</p>
      <ProfileForm profile={profile} />
      <form action={signOutAction}>
        <input type="hidden" name="next" value="/" />
        <button type="submit" className={cn(buttonVariants({ variant: "outline" }))}>
          Выйти
        </button>
      </form>
    </>
  );
}
