import { createHandler } from '../_shared/research.mjs';
Deno.serve(createHandler({env: (name: string) => Deno.env.get(name)}));
