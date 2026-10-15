import { stationCatalog } from "@/lib/public-api";

export function GET() {
  return Response.json(stationCatalog);
}
