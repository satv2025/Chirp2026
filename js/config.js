export const SUPABASE_URL = "https://kdohnkpykpcmnoyxhkte.supabase.co";

export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtkb2hua3B5a3BjbW5veXhoa3RlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwODYxMjgsImV4cCI6MjA5NzY2MjEyOH0.kPxH259iv3RZZxPJWIpqnfwzyRN-DJoXZdf9uNkRO7c";

export const APP = {
  name: "Chirp",
  origin: window.location.origin,
  authCallback: `${window.location.origin}/auth/callback/`,
  updatePassword: `${window.location.origin}/update-password/`,
  mediaBucket: "chirp-media",
  avatarBucket: "avatars",
  bannerBucket: "banners",
  chirpLimit: 280,
  authTimeoutMs: 30000,
  signupTimeoutMs: 90000
};
