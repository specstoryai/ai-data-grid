import { createJevHandler } from "@specstory/ai-data-grid/server";

// A build-time check that the /server subpath resolves and type-checks from the tarball.
// It never calls out: authorize rejects every request.
export const POST = createJevHandler({ apiKey: process.env.TYPESAFE_API_KEY ?? "", authorize: () => false });
