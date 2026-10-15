import documentation from "@/docs/api-reference.md?raw";

export function GET() {
  return new Response(documentation, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
