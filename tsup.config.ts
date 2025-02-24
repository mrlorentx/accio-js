import { defineConfig } from "tsup";

export default defineConfig({
  entryPoints: ["src/client.ts"],
  format: ["esm"],
  dts: true,
  treeshake: true,
  clean: true,
  minify: false,
});
