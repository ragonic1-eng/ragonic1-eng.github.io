import { createGoogleHandler } from '../_shared/google.mjs';
Deno.serve(createGoogleHandler({env: (name: string) => Deno.env.get(name)}));
