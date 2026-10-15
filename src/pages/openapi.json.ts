import { openapi } from "@/lib/public-api";

export function GET() {
  return Response.json(openapi);
}
