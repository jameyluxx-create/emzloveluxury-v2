import { redirect } from "next/navigation";

export default function Home() {
  // When someone hits "/", send them to the login page
  redirect("/login");
}
