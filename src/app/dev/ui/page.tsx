import { notFound } from "next/navigation";
import { UiGuideLoader } from "./ui-guide-loader";

export const metadata = {
  title: "Стайлгайд — Террикон Работа",
};

export default function DevUiPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <UiGuideLoader />;
}
