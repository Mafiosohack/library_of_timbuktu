import { redirect } from "next/navigation";

// The middleware sends unauthenticated users to /login; authenticated users
// land in the library. The root just forwards into the app.
export default function Home() {
  redirect("/library");
}
