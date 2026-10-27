import { createChatHandler } from '../_shared/chat.mjs';
Deno.serve(createChatHandler({env: (name: string) => Deno.env.get(name)}));
