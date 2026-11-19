import type { APIRoute } from 'astro';
import { downloadData, toCsv } from '@/lib/data-catalog';
export function getStaticPaths() {
  return ['distances', 'special-fares'].flatMap(dataset => ['csv', 'json'].map(format => ({ params: { file: `${dataset}.${format}` }, props: { dataset, format } })));
}
export const GET: APIRoute = ({ props }) => {
  const data = downloadData(props.dataset);
  const csv = props.format === 'csv';
  return new Response(csv ? toCsv(data.records) : JSON.stringify(data), { headers: {
    'Content-Type': csv ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
    'Content-Disposition': `attachment; filename="${props.dataset}.${props.format}"`,
    'X-Content-Type-Options': 'nosniff',
  } });
};
