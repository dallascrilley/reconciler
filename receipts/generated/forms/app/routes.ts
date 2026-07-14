import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("./routes/_index.tsx"),
  route("f.$", "./routes/f.$.tsx"),
] satisfies RouteConfig;
