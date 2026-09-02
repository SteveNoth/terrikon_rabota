import { redirect } from "next/navigation";
import { getDefaultCity } from "@/lib/geo";

export default function Home() {
  redirect(`/${getDefaultCity().slug}`);
}
