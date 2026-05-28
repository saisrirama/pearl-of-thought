// Username-based auth using synthetic emails on top of Supabase.
import { supabase } from "@/integrations/supabase/client";

// Username is stored in profiles; auth.users uses a synthetic email so Supabase
// can issue real JWTs without requiring a user-supplied email.
function syntheticEmail(username: string) {
  return `${username.toLowerCase().trim()}@knowledgehub.local`;
}

export async function signUp(params: {
  username: string;
  password: string;
  firstName: string;
  lastName: string;
}) {
  const { username, password, firstName, lastName } = params;
  const { data, error } = await supabase.auth.signUp({
    email: syntheticEmail(username),
    password,
    options: {
      data: {
        username: username.toLowerCase().trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      },
    },
  });
  if (error) throw error;
  return data;
}

export async function signIn(username: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: syntheticEmail(username),
    password,
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
}
