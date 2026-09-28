// Configuration Supabase.
// La clé "anon" est publique par conception (protégée par les règles RLS de la base) ;
// il est normal qu'elle soit présente dans le code de la page.
export const SUPABASE_URL = "https://bphiuavmlhxxcicwbzpg.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwaGl1YXZtbGh4eGNpY3dienBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4NjI5MzcsImV4cCI6MjEwNDQzODkzN30.BAT9Mq7AlzLkvTzJbYH0FHjqvqCIOeuk8khn_u7BP7A";

// Clé publique VAPID (rappels/notifications). Publique par conception (comme la clé anon) ;
// sa contrepartie privée (VAPID_PRIVATE_KEY) reste côté serveur, en variable d'environnement Vercel.
export const VAPID_PUBLIC_KEY = "BDLkEiJgsBkgfO3cJSX7oCvd0anJLPkGoqua_EBQ0tKRW1S9xU9kH24WCCGvZvgwheM1hPulbGP1HgzYwUjiXnY";
