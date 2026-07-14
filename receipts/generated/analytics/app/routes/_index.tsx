import { redirect } from "react-router";

function buildTarget(url: URL): string {
  return `/dashboard${url.search}${url.hash}`;
}

export function loader({ request }: { request: Request }) {
  throw redirect(buildTarget(new URL(request.url)));
}

export function clientLoader({ request }: { request: Request }) {
  throw redirect(buildTarget(new URL(request.url)));
}

export default function IndexPage() {
  return null;
}
