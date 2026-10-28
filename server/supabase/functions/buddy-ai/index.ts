import { createGateway } from "./handler.ts";

Deno.serve(createGateway({ env: (name) => Deno.env.get(name), fetch }));
