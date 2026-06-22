import { getSession } from "../lib/auth.js";
const session = await getSession();
if (session && ["/", "/index.html"].includes(window.location.pathname)) {
  // No auto redirect: la landing sigue disponible si el usuario quiere verla.
}
